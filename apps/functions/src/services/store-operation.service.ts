import admin from "firebase-admin";
import { z } from "zod";
import { getDb } from "../lib/firebase-admin";
import { AppError, ValidationError } from "../lib/errors";
import { logger } from "../lib/logger";
import {
  buildDefaultStoreHoursConfig,
  evaluateStoreStatus,
  formatLocalIso,
  parseStoreHoursConfig,
  storeHoursConfigSchema,
  storeOverrideSchema,
  toPublicStoreStatus,
  type PublicStoreStatus,
  type StoreActor,
  type StoreOverride,
  type StoreStatus,
} from "../lib/store-hours";
import {
  appendStoreEvent,
  plainReader,
  readStoreSnapshot,
  serializeFirestore,
  storeRefs,
  transactionReader,
  type StoreEventType,
} from "../repositories/firestore-store.repo";

const RECENT_EVENTS_LIMIT = 25;

export class StoreClosedError extends AppError {
  constructor(status: StoreStatus, schedule: unknown) {
    super(buildClosedMessage(status), 409, "STORE_CLOSED", {
      state: status.state,
      reasonCode: status.reasonCode,
      closure: status.source,
      timezone: status.timezone,
      localNow: status.localNow,
      today: status.today,
      nextOpenAt: status.nextOpenAt,
      schedule,
    });
    this.name = "StoreClosedError";
  }
}

function buildClosedMessage(status: StoreStatus): string {
  const kind =
    status.reasonCode === "CASH_CLOSED"
      ? "jornada cerrada en caja"
      : status.source === "manual"
        ? "cierre manual"
        : status.source === "schedule"
          ? "fuera de horario"
          : "horario no configurado o inválido";
  const today = status.today
    ? status.today.enabled
      ? ` Horario de hoy: ${status.today.open}–${status.today.close} (${status.timezone}).`
      : " Hoy no hay atención programada."
    : "";
  return `La tienda no está recibiendo pedidos (${kind}). ${status.message}${today}`.trim();
}

/**
 * Order guard: must be called inside the order-creation transaction so a
 * manual close committed before the order is always observed.
 */
export async function assertStoreAcceptingOrders(
  tx: admin.firestore.Transaction,
  tenantId: string
): Promise<StoreStatus> {
  const snapshot = await readStoreSnapshot(tenantId, transactionReader(tx), new Date());
  if (!snapshot.status.acceptingOrders) {
    const parsed = snapshot.hoursRaw ? parseStoreHoursConfig(snapshot.hoursRaw) : null;
    throw new StoreClosedError(snapshot.status, parsed?.ok ? parsed.config.days : null);
  }
  return snapshot.status;
}

/**
 * Evaluates the current state and, when it differs from the last observed
 * one, appends a `schedule` audit event (scheduled open/close, override
 * expiry, config becoming invalid). Manual actions update the observed state
 * themselves, so they are never logged twice.
 */
export async function observeStoreStatus(tenantId: string): Promise<StoreStatus> {
  return getDb().runTransaction(async (tx) => {
    const now = new Date();
    const snapshot = await readStoreSnapshot(tenantId, transactionReader(tx), now);
    const { status, operation } = snapshot;

    if (operation.lastObservedState !== status.state) {
      appendStoreEvent(
        tx,
        tenantId,
        {
          type: "schedule_transition",
          source: "schedule",
          actor: null,
          reason: null,
          previousState: operation.lastObservedState ?? null,
          newState: status.state,
          reasonCode: status.reasonCode,
          operationalDate: status.operationalDate,
        },
        now,
        snapshot.timezone
      );
      tx.set(
        storeRefs(tenantId).operation,
        {
          lastObservedState: status.state,
          lastObservedOperationalDate: status.operationalDate,
          lastObservedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    return status;
  });
}

export async function getPublicStoreStatus(tenantId: string): Promise<PublicStoreStatus> {
  const snapshot = await readStoreSnapshot(tenantId, plainReader, new Date());
  return toPublicStoreStatus(snapshot.status);
}

export async function getStoreControl(tenantId: string) {
  const status = await observeStoreStatus(tenantId);
  const refs = storeRefs(tenantId);
  const [snapshot, eventsSnap] = await Promise.all([
    readStoreSnapshot(tenantId, plainReader, new Date()),
    refs.events.orderBy("at", "desc").limit(RECENT_EVENTS_LIMIT).get(),
  ]);

  const parsed = snapshot.hoursRaw ? parseStoreHoursConfig(snapshot.hoursRaw) : null;

  return {
    status,
    config: parsed?.ok ? parsed.config : null,
    configUpdatedAt: serializeFirestore(snapshot.hoursRaw?.updatedAt ?? null),
    configUpdatedBy: snapshot.hoursRaw?.updatedBy ?? null,
    defaultConfig: buildDefaultStoreHoursConfig(),
    events: eventsSnap.docs.map((doc) => serializeFirestore(doc.data())),
  };
}

export const storeOperationInputSchema = z.object({
  tenantId: z.string().min(1).optional(),
  action: z.enum(["open", "close", "resume_schedule"]),
  reason: z.string().trim().max(280).optional(),
});
export type StoreOperationInput = z.infer<typeof storeOperationInputSchema>;

export async function setStoreOperation(
  tenantId: string,
  actor: StoreActor,
  input: StoreOperationInput
): Promise<{ changed: boolean; status: StoreStatus; eventId: string | null }> {
  return getDb().runTransaction(async (tx) => {
    const now = new Date();
    const snapshot = await readStoreSnapshot(tenantId, transactionReader(tx), now);
    const previous = snapshot.status;

    if (!previous.operationalDate) {
      throw new AppError(
        `No se puede operar la tienda manualmente: ${previous.message} Corrige el horario primero.`,
        409,
        "STORE_CONFIG_INVALID",
        { reasonCode: previous.reasonCode, configErrors: previous.configErrors ?? [] }
      );
    }

    if (previous.reasonCode === "CASH_CLOSED") {
      if (input.action === "close") {
        return { changed: false, status: previous, eventId: null };
      }
      throw new AppError(
        `La caja de ${previous.operationalDate} ya fue cerrada: la tienda no puede reabrirse hasta el próximo día operacional.`,
        409,
        "CASH_ALREADY_CLOSED",
        { operationalDate: previous.operationalDate }
      );
    }

    const reason = input.reason?.trim() || null;
    const nextOverride: StoreOverride | null =
      input.action === "resume_schedule"
        ? null
        : {
            mode: input.action === "open" ? "open" : "closed",
            operationalDate: previous.operationalDate,
            reason,
            actor,
            at: formatLocalIso(now, snapshot.timezone),
          };

    const currentOverride = previous.override;
    const unchanged =
      (nextOverride === null && currentOverride === null) ||
      (nextOverride !== null && currentOverride?.mode === nextOverride.mode);
    if (unchanged) {
      return { changed: false, status: previous, eventId: null };
    }

    const next = evaluateStoreStatus({
      now,
      config: snapshot.hoursRaw,
      override: nextOverride,
      cashClosedOperationalDate: null,
    });

    const reopening = previous.state === "manual_closed" && next.acceptingOrders;
    const type: StoreEventType =
      input.action === "close"
        ? "store_closed"
        : input.action === "resume_schedule"
          ? "schedule_resumed"
          : reopening
            ? "store_reopened"
            : "store_opened";

    tx.set(
      storeRefs(tenantId).operation,
      {
        override: nextOverride,
        lastObservedState: next.state,
        lastObservedOperationalDate: next.operationalDate,
        lastObservedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: actor,
      },
      { merge: true }
    );

    const eventId = appendStoreEvent(
      tx,
      tenantId,
      {
        type,
        source: "manual",
        actor,
        reason,
        previousState: previous.state,
        newState: next.state,
        reasonCode: next.reasonCode,
        operationalDate: next.operationalDate,
        metadata: { action: input.action },
      },
      now,
      snapshot.timezone
    );

    logger.info("Store operation changed", {
      tenantId,
      action: input.action,
      from: previous.state,
      to: next.state,
      actor: actor.uid,
    });

    return { changed: true, status: next, eventId };
  });
}

export const updateStoreHoursInputSchema = z.object({
  tenantId: z.string().min(1).optional(),
  config: z.unknown(),
  reason: z.string().trim().max(280).optional(),
});

export async function updateStoreHours(
  tenantId: string,
  actor: StoreActor,
  rawConfig: unknown,
  reason?: string
): Promise<{ status: StoreStatus; eventId: string }> {
  const parsed = storeHoursConfigSchema.safeParse(rawConfig);
  if (!parsed.success) {
    throw new ValidationError("Horario inválido", parsed.error.issues);
  }
  const config = parsed.data;

  return getDb().runTransaction(async (tx) => {
    const now = new Date();
    const snapshot = await readStoreSnapshot(tenantId, transactionReader(tx), now);
    const previous = snapshot.status;

    const overrideParse = storeOverrideSchema.safeParse(snapshot.operation.override ?? null);
    const next = evaluateStoreStatus({
      now,
      config,
      override: overrideParse.success ? overrideParse.data : null,
      cashClosedOperationalDate:
        previous.reasonCode === "CASH_CLOSED" ? previous.operationalDate : null,
    });

    const refs = storeRefs(tenantId);
    tx.set(refs.hours, {
      ...config,
      schemaVersion: 1,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: actor,
    });
    tx.set(
      refs.operation,
      {
        lastObservedState: next.state,
        lastObservedOperationalDate: next.operationalDate,
        lastObservedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // The previous config is kept inside the event: history is never overwritten.
    const eventId = appendStoreEvent(
      tx,
      tenantId,
      {
        type: "hours_updated",
        source: "manual",
        actor,
        reason: reason?.trim() || null,
        previousState: previous.state,
        newState: next.state,
        reasonCode: next.reasonCode,
        operationalDate: next.operationalDate,
        metadata: { previousConfig: snapshot.hoursRaw, newConfig: config },
      },
      now,
      config.timezone
    );

    logger.info("Store hours updated", { tenantId, actor: actor.uid, to: next.state });
    return { status: next, eventId };
  });
}
