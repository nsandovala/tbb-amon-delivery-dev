import admin from "firebase-admin";
import { getDb } from "../lib/firebase-admin";
import { AppError, NotFoundError } from "../lib/errors";
import { logger } from "../lib/logger";
import { derivePaymentEventId, fingerprintOrderIntent } from "../lib/idempotency";
import type { PaymentEventType } from "../lib/payment-ledger";
import {
  DEFAULT_STORE_TIMEZONE,
  formatLocalIso,
  getOperationalDateFor,
  parseStoreHoursConfig,
} from "../lib/store-hours";
import type { AuthorizedActor } from "../lib/authz";
import type {
  ConfirmTransferPaymentInput,
  ListPaymentEventsQuery,
  RevertTransferConfirmationInput,
} from "../schemas/payment-confirmation.schema";
import { serializeFirestore, storeRefs } from "./firestore-store.repo";

/**
 * FIN-01 — libro `tenants/{t}/paymentEvents` y proyección de pago en el pedido.
 *
 * Cada confirmación/reversión es UNA transacción que:
 *   1. Lee el evento derivado de la clave (idempotencia) y el pedido.
 *   2. Calcula la jornada efectiva E con la timezone configurada y el corte 05:00.
 *   3. Exige `cashCloses/{E}` inexistente (caja de E abierta).
 *   4. Crea el evento (`tx.create`), actualiza la proyección del pedido e
 *      incrementa `orderCounters/{E}.payments` con `set merge`, que crea el
 *      documento si no existe y nunca toca `lastDisplayOrderNumber`.
 *
 * FIN-H01: `closeCashSession` lee `orderCounters/{D}` en su transacción; esta
 * escritura choca con esa lectura y serializa ambas operaciones sin depender
 * de bloqueos de rango sobre la consulta de eventos.
 */

export type PaymentActor = Pick<AuthorizedActor, "uid" | "email" | "role">;

export type PaymentConfirmationProjection = {
  eventId: string;
  amount: number;
  confirmedAt: unknown;
  effectiveOperationalDate: string;
};

export type PaymentMutationResult = {
  replayed: boolean;
  eventId: string;
  action: PaymentEventType;
  orderId: string;
  amount: number;
  effectiveOperationalDate: string;
  currentPaymentStatus: string;
  activeConfirmationEventId: string | null;
  /** Solo en confirmaciones: si la confirmación de este evento sigue vigente. */
  confirmationActive?: boolean;
};

function paymentConflict(code: string, message: string, details?: unknown): AppError {
  return new AppError(message, 409, code, details);
}

type OrderData = {
  status?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  operationalDate?: string;
  totals?: { total?: number };
  paymentConfirmation?: PaymentConfirmationProjection | null;
};

function activeConfirmationId(order: OrderData): string | null {
  return order.paymentStatus === "paid" ? order.paymentConfirmation?.eventId ?? null : null;
}

/** Respuesta de un evento ya registrado, con el estado ACTUAL del pedido. */
function replayResult(
  event: admin.firestore.DocumentSnapshot,
  order: OrderData,
  fingerprint: string
): PaymentMutationResult {
  const data = event.data() ?? {};
  if ((data.idempotency as { fingerprint?: unknown } | undefined)?.fingerprint !== fingerprint) {
    throw paymentConflict(
      "IDEMPOTENCY_KEY_REUSED",
      "Esta clave ya se usó para otra operación de pago. Genera una clave nueva."
    );
  }
  const action = data.type as PaymentEventType;
  const active = activeConfirmationId(order);
  return {
    replayed: true,
    eventId: event.id,
    action,
    orderId: data.orderId as string,
    amount: Math.abs(data.signedAmount as number),
    effectiveOperationalDate: data.effectiveOperationalDate as string,
    currentPaymentStatus: order.paymentStatus ?? "pending",
    activeConfirmationEventId: active,
    ...(action === "transfer_confirmed" ? { confirmationActive: active === event.id } : {}),
  };
}

async function resolveEffectiveDate(
  tx: admin.firestore.Transaction,
  tenantId: string,
  now: Date
): Promise<{ effectiveOperationalDate: string; timezone: string }> {
  const refs = storeRefs(tenantId);
  const hours = await tx.get(refs.hours);
  const parsed = hours.exists ? parseStoreHoursConfig(hours.data()) : null;
  const timezone = parsed?.ok ? parsed.config.timezone : DEFAULT_STORE_TIMEZONE;
  return { effectiveOperationalDate: getOperationalDateFor(now, timezone), timezone };
}

async function assertEffectiveDayOpen(
  tx: admin.firestore.Transaction,
  tenantId: string,
  effectiveOperationalDate: string
): Promise<void> {
  const close = await tx.get(storeRefs(tenantId).cashClose(effectiveOperationalDate));
  if (close.exists) {
    throw paymentConflict(
      "CASH_DAY_CLOSED",
      `La caja de la jornada ${effectiveOperationalDate} ya fue cerrada; la operación de pago se registra en la próxima jornada.`,
      { effectiveOperationalDate }
    );
  }
}

function bumpCounter(
  tx: admin.firestore.Transaction,
  tenantId: string,
  effectiveOperationalDate: string,
  signedAmount: number
): void {
  tx.set(
    storeRefs(tenantId).orderCounter(effectiveOperationalDate),
    {
      tenantId,
      operationalDate: effectiveOperationalDate,
      payments: {
        transferEventCount: admin.firestore.FieldValue.increment(1),
        transferNet: admin.firestore.FieldValue.increment(signedAmount),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

function orderTotal(order: OrderData): number {
  const total = order.totals?.total;
  return typeof total === "number" && Number.isInteger(total) && total > 0 ? total : 0;
}

export async function confirmTransferPayment(
  actor: PaymentActor,
  input: ConfirmTransferPaymentInput
): Promise<PaymentMutationResult> {
  const { tenantId, orderId } = input;
  const action: PaymentEventType = "transfer_confirmed";
  const refs = storeRefs(tenantId);
  const eventRef = refs.paymentEvents.doc(
    derivePaymentEventId(tenantId, orderId, action, input.idempotencyKey)
  );
  const orderRef = refs.orders.doc(orderId);
  const fingerprint = fingerprintOrderIntent({
    action,
    orderId,
    expectedAmount: input.expectedAmount,
    reference: input.reference,
  });

  const result = await getDb().runTransaction(async (tx): Promise<PaymentMutationResult> => {
    const now = new Date();
    const [eventSnap, orderSnap] = await tx.getAll(eventRef, orderRef);
    if (!orderSnap.exists) throw new NotFoundError(`Order ${orderId}`);
    const order = (orderSnap.data() ?? {}) as OrderData;

    if (eventSnap.exists) return replayResult(eventSnap, order, fingerprint);

    if (order.paymentMethod !== "transfer") {
      throw paymentConflict("PAYMENT_METHOD_NOT_TRANSFER", "Solo se pueden confirmar pedidos pagados por transferencia.");
    }
    if (order.status === "cancelled") {
      throw paymentConflict("ORDER_CANCELLED", "El pedido está cancelado; no se puede confirmar su pago.");
    }
    const active = activeConfirmationId(order);
    if (active) {
      throw paymentConflict("PAYMENT_ALREADY_CONFIRMED", "La transferencia de este pedido ya está confirmada.", {
        activeConfirmationEventId: active,
        effectiveOperationalDate: order.paymentConfirmation?.effectiveOperationalDate ?? null,
      });
    }
    const total = orderTotal(order);
    if (!total || input.expectedAmount !== total) {
      throw paymentConflict("AMOUNT_MISMATCH", "El monto no coincide con el total del pedido. No se registró la confirmación.", {
        expectedAmount: input.expectedAmount,
        orderTotal: total,
      });
    }

    const { effectiveOperationalDate, timezone } = await resolveEffectiveDate(tx, tenantId, now);
    await assertEffectiveDayOpen(tx, tenantId, effectiveOperationalDate);

    const at = admin.firestore.FieldValue.serverTimestamp();
    tx.create(eventRef, {
      id: eventRef.id,
      tenantId,
      orderId,
      type: action,
      method: "transfer",
      signedAmount: total,
      actor: { uid: actor.uid, email: actor.email, role: actor.role },
      at,
      atLocal: formatLocalIso(now, timezone),
      effectiveOperationalDate,
      originOperationalDate: order.operationalDate ?? null,
      reference: input.reference ?? null,
      reason: null,
      reversesEventId: null,
      idempotency: { version: 1, fingerprint },
    });
    tx.update(orderRef, {
      paymentStatus: "paid",
      paymentConfirmation: {
        eventId: eventRef.id,
        amount: total,
        confirmedAt: at,
        effectiveOperationalDate,
      },
      updatedAt: at,
    });
    bumpCounter(tx, tenantId, effectiveOperationalDate, total);

    return {
      replayed: false,
      eventId: eventRef.id,
      action,
      orderId,
      amount: total,
      effectiveOperationalDate,
      currentPaymentStatus: "paid",
      activeConfirmationEventId: eventRef.id,
      confirmationActive: true,
    };
  });

  logger.info(result.replayed ? "Transfer confirmation replayed" : "Transfer confirmed", {
    tenantId,
    orderId,
    eventId: result.eventId,
    actor: actor.uid,
    effectiveOperationalDate: result.effectiveOperationalDate,
  });
  return result;
}

export async function revertTransferConfirmation(
  actor: PaymentActor,
  input: RevertTransferConfirmationInput
): Promise<PaymentMutationResult> {
  const { tenantId, orderId } = input;
  const action: PaymentEventType = "transfer_confirmation_reverted";
  const refs = storeRefs(tenantId);
  const eventRef = refs.paymentEvents.doc(
    derivePaymentEventId(tenantId, orderId, action, input.idempotencyKey)
  );
  const orderRef = refs.orders.doc(orderId);
  const fingerprint = fingerprintOrderIntent({
    action,
    orderId,
    expectedConfirmationEventId: input.expectedConfirmationEventId,
    reason: input.reason,
  });

  const result = await getDb().runTransaction(async (tx): Promise<PaymentMutationResult> => {
    const now = new Date();
    const [eventSnap, orderSnap] = await tx.getAll(eventRef, orderRef);
    if (!orderSnap.exists) throw new NotFoundError(`Order ${orderId}`);
    const order = (orderSnap.data() ?? {}) as OrderData;

    if (eventSnap.exists) return replayResult(eventSnap, order, fingerprint);

    if (order.paymentMethod !== "transfer") {
      throw paymentConflict("PAYMENT_METHOD_NOT_TRANSFER", "Solo se pueden revertir confirmaciones de transferencia.");
    }
    const active = activeConfirmationId(order);
    if (!active || !order.paymentConfirmation) {
      throw paymentConflict("PAYMENT_NOT_CONFIRMED", "El pedido no tiene una confirmación vigente para revertir.");
    }
    if (active !== input.expectedConfirmationEventId) {
      throw paymentConflict("STALE_CONFIRMATION", "La confirmación vigente cambió; actualiza el pedido antes de revertir.", {
        activeConfirmationEventId: active,
      });
    }

    const { effectiveOperationalDate, timezone } = await resolveEffectiveDate(tx, tenantId, now);
    await assertEffectiveDayOpen(tx, tenantId, effectiveOperationalDate);

    const reversed = order.paymentConfirmation.amount;
    const at = admin.firestore.FieldValue.serverTimestamp();
    tx.create(eventRef, {
      id: eventRef.id,
      tenantId,
      orderId,
      type: action,
      method: "transfer",
      signedAmount: -reversed,
      actor: { uid: actor.uid, email: actor.email, role: actor.role },
      at,
      atLocal: formatLocalIso(now, timezone),
      effectiveOperationalDate,
      originOperationalDate: order.operationalDate ?? null,
      reference: null,
      reason: input.reason,
      reversesEventId: active,
      idempotency: { version: 1, fingerprint },
    });
    tx.update(orderRef, {
      paymentStatus: "pending",
      paymentConfirmation: null,
      lastPaymentReversal: {
        eventId: eventRef.id,
        reversesEventId: active,
        revertedAt: at,
        effectiveOperationalDate,
      },
      updatedAt: at,
    });
    bumpCounter(tx, tenantId, effectiveOperationalDate, -reversed);

    return {
      replayed: false,
      eventId: eventRef.id,
      action,
      orderId,
      amount: reversed,
      effectiveOperationalDate,
      currentPaymentStatus: "pending",
      activeConfirmationEventId: null,
    };
  });

  logger.info(result.replayed ? "Transfer reversal replayed" : "Transfer confirmation reverted", {
    tenantId,
    orderId,
    eventId: result.eventId,
    actor: actor.uid,
    effectiveOperationalDate: result.effectiveOperationalDate,
  });
  return result;
}

/** Tope de eventos devueltos por `listPaymentEvents`. */
export const LIST_PAYMENT_EVENTS_LIMIT = 100;

/**
 * Lectura auditada del libro (requiere `payments.view` en la ruta). Filtra por
 * un solo campo (índice automático) y ordena en memoria. `complete: false`
 * avisa que hubo más eventos que el tope.
 */
export async function listPaymentEvents(query: ListPaymentEventsQuery) {
  const events = storeRefs(query.tenantId).paymentEvents;
  const filtered = query.orderId
    ? events.where("orderId", "==", query.orderId)
    : events.where("effectiveOperationalDate", "==", query.operationalDate);
  const snap = await filtered.limit(LIST_PAYMENT_EVENTS_LIMIT + 1).get();
  const docs = snap.docs.slice(0, LIST_PAYMENT_EVENTS_LIMIT);
  const rows = docs.map((doc) => {
    const { idempotency: _idempotency, ...data } = doc.data();
    return serializeFirestore({ id: doc.id, ...data }) as Record<string, unknown> & { at?: string };
  });
  rows.sort((a, b) => String(a.at ?? "").localeCompare(String(b.at ?? "")));
  return { events: rows, complete: snap.size <= LIST_PAYMENT_EVENTS_LIMIT };
}
