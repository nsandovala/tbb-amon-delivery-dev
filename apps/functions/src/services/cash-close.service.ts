import admin from "firebase-admin";
import { z } from "zod";
import { getDb } from "../lib/firebase-admin";
import { AppError, ValidationError } from "../lib/errors";
import { logger } from "../lib/logger";
import {
  computeCashDifferences,
  summarizeCashDay,
  type CashCloseExpense,
  type CashCloseOrder,
} from "../lib/cash-close";
import {
  MAX_PAYMENT_EVENTS_PER_DAY,
  ledgerMatchesCounter,
  type LedgerCounter,
  type LedgerEvent,
} from "../lib/payment-ledger";
import {
  formatLocalIso,
  getOperationalDateFor,
  getOperationalDayWindow,
  type StoreActor,
} from "../lib/store-hours";
import {
  appendStoreEvent,
  plainReader,
  readStoreSnapshot,
  serializeFirestore,
  storeRefs,
  transactionReader,
} from "../repositories/firestore-store.repo";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isRealOperationalDate(value: string): boolean {
  if (!DATE_REGEX.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export const closeCashSessionInputSchema = z.object({
  tenantId: z.string().min(1).optional(),
  operationalDate: z.string().regex(DATE_REGEX).optional(),
  countedCash: z.number().int("countedCash must be whole CLP").min(0),
  transfersConfirmed: z.number().int("transfersConfirmed must be whole CLP").min(0),
  observation: z.string().trim().max(500).optional(),
  override: z
    .object({ reason: z.string().trim().min(5, "Override reason must be at least 5 characters").max(280) })
    .optional(),
  idempotencyKey: z.string().trim().min(8).max(100),
});
export type CloseCashSessionInput = z.infer<typeof closeCashSessionInputSchema>;

type Reader = {
  query: (query: admin.firestore.Query) => Promise<admin.firestore.QuerySnapshot>;
  doc: (ref: admin.firestore.DocumentReference) => Promise<admin.firestore.DocumentSnapshot>;
};

const plainDayReader: Reader = {
  query: (query) => query.get(),
  doc: (ref) => ref.get(),
};

async function resolveOperationalDate(tenantId: string, requested: string | undefined, now: Date) {
  const snapshot = await readStoreSnapshot(tenantId, plainReader, now);
  const current = getOperationalDateFor(now, snapshot.timezone);
  const operationalDate = requested ?? current;

  if (!isRealOperationalDate(operationalDate)) {
    throw new ValidationError("operationalDate must be YYYY-MM-DD");
  }
  if (operationalDate > current) {
    throw new ValidationError(`No se puede cerrar caja de un día operacional futuro (${operationalDate}).`);
  }

  return { operationalDate, current, timezone: snapshot.timezone, snapshot };
}

async function loadDay(
  tenantId: string,
  operationalDate: string,
  timezone: string,
  reader: Reader
) {
  const refs = storeRefs(tenantId);
  const window = getOperationalDayWindow(operationalDate, timezone);
  // FIN-01: el contador de la jornada se lee junto a los eventos. Dentro de la
  // transacción de cierre, esta lectura es la que choca con confirmaciones y
  // reversiones concurrentes (FIN-H01).
  const [ordersSnap, expensesSnap, eventsSnap, counterSnap] = await Promise.all([
    reader.query(refs.orders.where("operationalDate", "==", operationalDate)),
    reader.query(
      refs.expenses
        .where("occurredAt", ">=", admin.firestore.Timestamp.fromDate(window.start))
        .where("occurredAt", "<", admin.firestore.Timestamp.fromDate(window.end))
    ),
    reader.query(
      refs.paymentEvents
        .where("effectiveOperationalDate", "==", operationalDate)
        .limit(MAX_PAYMENT_EVENTS_PER_DAY + 1)
    ),
    reader.doc(refs.orderCounter(operationalDate)),
  ]);

  const orders = ordersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as CashCloseOrder);
  const expenses = expensesSnap.docs.map(
    (doc) => ({ id: doc.id, ...doc.data() }) as CashCloseExpense
  );
  const paymentEvents = eventsSnap.docs.map((doc) => doc.data() as LedgerEvent);
  const counter = (counterSnap.data()?.payments ?? null) as LedgerCounter;
  const summary = summarizeCashDay({ operationalDate, orders, expenses, paymentEvents });

  return {
    window,
    summary,
    ledger: {
      counter: {
        transferEventCount: counter?.transferEventCount ?? 0,
        transferNet: counter?.transferNet ?? 0,
      },
      consistent: ledgerMatchesCounter(summary.transferCollections, counter),
    },
  };
}

export async function getCashCloseSummary(tenantId: string, requestedDate?: string) {
  const now = new Date();
  const { operationalDate, current, timezone, snapshot } = await resolveOperationalDate(
    tenantId,
    requestedDate,
    now
  );

  const closeSnap = await storeRefs(tenantId).cashClose(operationalDate).get();
  const window = getOperationalDayWindow(operationalDate, timezone);
  const base = {
    operationalDate,
    isCurrentOperationalDay: operationalDate === current,
    timezone,
    window: {
      start: formatLocalIso(window.start, timezone),
      end: formatLocalIso(window.end, timezone),
    },
    storeState: snapshot.status.state,
  };

  // FIN-01: una jornada cerrada se informa SIEMPRE desde su snapshot inmutable.
  // Recalcular con datos actuales cambiaría cifras históricas en silencio
  // (p. ej. confirmaciones tardías imputadas a otra jornada).
  if (closeSnap.exists) {
    const close = serializeFirestore(closeSnap.data()) as { summary?: unknown };
    return { ...base, summarySource: "snapshot" as const, summary: close.summary ?? null, ledger: null, close };
  }

  const { summary, ledger } = await loadDay(tenantId, operationalDate, timezone, plainDayReader);
  return { ...base, summarySource: "live" as const, summary, ledger, close: null };
}

export async function closeCashSession(
  tenantId: string,
  actor: StoreActor,
  input: CloseCashSessionInput
): Promise<{ replayed: boolean; close: unknown }> {
  const now = new Date();
  const { operationalDate, current, timezone } = await resolveOperationalDate(
    tenantId,
    input.operationalDate,
    now
  );

  return getDb().runTransaction(async (tx) => {
    const refs = storeRefs(tenantId);
    const closeRef = refs.cashClose(operationalDate);
    const existing = await tx.get(closeRef);

    if (existing.exists) {
      const data = existing.data() ?? {};
      if (data.idempotencyKey === input.idempotencyKey) {
        return { replayed: true, close: serializeFirestore(data) };
      }
      throw new AppError(
        `La caja de ${operationalDate} ya fue cerrada por ${data.closedBy?.email ?? data.closedBy?.uid ?? "otro usuario"}.`,
        409,
        "CASH_ALREADY_CLOSED",
        { operationalDate, close: serializeFirestore(data) }
      );
    }

    const { summary, ledger } = await loadDay(tenantId, operationalDate, timezone, {
      query: (query) => tx.get(query),
      doc: (ref) => tx.get(ref),
    });
    const store = await readStoreSnapshot(tenantId, transactionReader(tx), now);

    // FIN-Q01: nunca cerrar con un libro truncado ni incoherente con el contador.
    if (!summary.transferCollections.complete) {
      throw new AppError(
        `La jornada tiene más de ${MAX_PAYMENT_EVENTS_PER_DAY} eventos de pago; el cierre no puede verificarlos en una transacción.`,
        409,
        "PAYMENT_EVENTS_LIMIT",
        { limit: MAX_PAYMENT_EVENTS_PER_DAY }
      );
    }
    if (!ledger.consistent) {
      logger.error("Cash close ledger mismatch", {
        tenantId,
        operationalDate,
        counter: ledger.counter,
        eventCount: summary.transferCollections.eventCount,
        net: summary.transferCollections.net,
      });
      throw new AppError(
        "El libro de pagos de la jornada no coincide con su contador. No se cerró la caja; reintenta o revisa la auditoría.",
        409,
        "CASH_CLOSE_INCONSISTENT",
        {
          counter: ledger.counter,
          ledger: {
            transferEventCount: summary.transferCollections.eventCount,
            transferNet: summary.transferCollections.net,
          },
        }
      );
    }

    const activeOrderBlockers = summary.blockers.filter((blocker) =>
      blocker.code === "ACTIVE_POS_SALES" || blocker.code === "ACTIVE_OTHER_ORDERS"
    );
    if (activeOrderBlockers.length > 0) {
      throw new AppError(
        "No se puede cerrar caja: hay pedidos activos. Llévalos a un estado terminal antes del cierre; el override no puede dejar pedidos atrapados.",
        409,
        "CASH_CLOSE_BLOCKED",
        { blockers: summary.blockers, nonOverridableBlockers: activeOrderBlockers, summary }
      );
    }
    if (summary.blockers.length > 0 && !input.override) {
      throw new AppError(
        "No se puede cerrar caja: hay ventas POS activas o pagos pendientes. Ciérralas o registra un override administrativo con motivo.",
        409,
        "CASH_CLOSE_BLOCKED",
        { blockers: summary.blockers, summary }
      );
    }

    const differences = computeCashDifferences(summary, input);
    const closedAtLocal = formatLocalIso(now, timezone);
    const affectsCurrentDay = operationalDate === current;

    const close = {
      id: operationalDate,
      tenantId,
      operationalDate,
      timezone,
      status: "closed",
      countedCash: input.countedCash,
      transfersConfirmed: input.transfersConfirmed,
      expectedCash: summary.expectedCash,
      expectedTransfers: summary.expectedTransfers,
      summaryVersion: summary.summaryVersion,
      systemConfirmedTransfers: summary.transferCollections.net,
      ledgerCounter: ledger.counter,
      ...differences,
      pendingSales: summary.pendingSales,
      activeExpenses: summary.activeExpenses,
      observation: input.observation?.trim() || null,
      override: input.override
        ? { reason: input.override.reason, blockers: summary.blockers, actor }
        : null,
      summary,
      closedBy: actor,
      closedAt: admin.firestore.FieldValue.serverTimestamp(),
      closedAtLocal,
      idempotencyKey: input.idempotencyKey,
      storeStateBefore: store.status.state,
    };

    // `create` fails if a concurrent request already closed this day.
    tx.create(closeRef, close);

    appendStoreEvent(
      tx,
      tenantId,
      {
        type: "cash_closed",
        source: "manual",
        actor,
        reason: input.override?.reason ?? input.observation?.trim() ?? null,
        previousState: store.status.state,
        newState: affectsCurrentDay ? "closed" : store.status.state,
        reasonCode: affectsCurrentDay ? "CASH_CLOSED" : store.status.reasonCode,
        operationalDate,
        metadata: {
          cashDifference: differences.cashDifference,
          transferDifference: differences.transferDifference,
          collectionDifference: differences.collectionDifference,
          override: Boolean(input.override),
          blockers: summary.blockers.map((blocker) => blocker.code),
        },
      },
      now,
      timezone
    );

    if (affectsCurrentDay) {
      tx.set(
        refs.operation,
        {
          lastObservedState: "closed",
          lastObservedOperationalDate: operationalDate,
          lastObservedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    logger.info("Cash session closed", {
      tenantId,
      operationalDate,
      actor: actor.uid,
      cashDifference: differences.cashDifference,
      override: Boolean(input.override),
    });

    return {
      replayed: false,
      close: { ...close, closedAt: now.toISOString() },
    };
  });
}
