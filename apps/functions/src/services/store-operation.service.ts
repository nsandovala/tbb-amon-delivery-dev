import admin from "firebase-admin";
import { z } from "zod";
import { getDb } from "../lib/firebase-admin";
import { AppError, ValidationError } from "../lib/errors";
import { logger } from "../lib/logger";
import {
  buildDefaultStoreHoursConfig,
  evaluateStoreStatus,
  formatLocalDateKey,
  formatLocalIso,
  parseStoreHoursConfig,
  storeHoursConfigSchema,
  storeDateExceptionSchema,
  storeOverrideSchema,
  toPublicStoreStatus,
  type PublicStoreStatus,
  type StoreDateException,
  type StoreHoursConfig,
  type Weekday,
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
  listUpcomingStoreDateExceptions,
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
  tenantId: string,
  now = new Date()
): Promise<StoreStatus> {
  const snapshot = await readStoreSnapshot(tenantId, transactionReader(tx), now);
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
  const fromDate = formatLocalDateKey(new Date(), snapshot.timezone);
  const throughDateValue = new Date(`${fromDate}T12:00:00.000Z`);
  throughDateValue.setUTCDate(throughDateValue.getUTCDate() + 90);
  const throughDate = throughDateValue.toISOString().slice(0, 10);
  const upcoming = await listUpcomingStoreDateExceptions(tenantId, fromDate, throughDate, 12);
  return toPublicStoreStatus(snapshot.status, upcoming.map(publicDateException));
}

export async function getStoreControl(tenantId: string) {
  const status = await observeStoreStatus(tenantId);
  const refs = storeRefs(tenantId);
  const [snapshot, eventsSnap] = await Promise.all([
    readStoreSnapshot(tenantId, plainReader, new Date()),
    refs.events.orderBy("at", "desc").limit(RECENT_EVENTS_LIMIT).get(),
  ]);

  const fromDate = formatLocalDateKey(new Date(), snapshot.timezone);
  // Admin debe poder volver a encontrar cualquier excepción que el backend
  // acepta guardar, aunque esté a más de un año o existan más de 100 fechas.
  const specialDates = await listUpcomingStoreDateExceptions(tenantId, fromDate);

  const parsed = snapshot.hoursRaw ? parseStoreHoursConfig(snapshot.hoursRaw) : null;

  return {
    status,
    config: parsed?.ok ? parsed.config : null,
    configUpdatedAt: serializeFirestore(snapshot.hoursRaw?.updatedAt ?? null),
    configUpdatedBy: snapshot.hoursRaw?.updatedBy ?? null,
    defaultConfig: buildDefaultStoreHoursConfig(),
    specialDates,
    events: eventsSnap.docs.map((doc) => serializeFirestore(doc.data())),
  };
}

function publicDateException(exception: StoreDateException): StoreDateException {
  return {
    date: exception.date,
    mode: exception.mode,
    ...(exception.open ? { open: exception.open } : {}),
    ...(exception.close ? { close: exception.close } : {}),
    customerMessage: exception.customerMessage,
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
      dateExceptions: snapshot.dateExceptions,
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
    let existingClosedDate: string | null = null;
    const previousOperationalDate = snapshot.operation.lastObservedOperationalDate;
    if (previousOperationalDate) {
      const closeSnap = await transactionReader(tx)(storeRefs(tenantId).cashClose(previousOperationalDate));
      if (closeSnap.exists) existingClosedDate = previousOperationalDate;
    }
    const next = evaluateStoreStatus({
      now,
      config,
      override: overrideParse.success ? overrideParse.data : null,
      cashClosedOperationalDate: existingClosedDate,
      dateExceptions: snapshot.dateExceptions,
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

export const updateStoreDateExceptionInputSchema = z.object({
  tenantId: z.string().min(1).optional(),
  exception: z.unknown(),
  reason: z.string().trim().max(280).optional(),
});

export const deleteStoreDateExceptionInputSchema = z.object({
  tenantId: z.string().min(1).optional(),
  date: z.string(),
  reason: z.string().trim().max(280).optional(),
});

function getExceptionWeekday(date: string): Weekday {
  const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  return (["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const)[weekday];
}

function validateDateException(
  snapshot: Awaited<ReturnType<typeof readStoreSnapshot>>,
  rawException: unknown,
  now: Date
): StoreDateException {
  const parsed = storeDateExceptionSchema.safeParse(rawException);
  if (!parsed.success) throw new ValidationError("Excepción de fecha inválida", parsed.error.issues);

  const schedule = snapshot.hoursRaw ? parseStoreHoursConfig(snapshot.hoursRaw) : null;
  if (!schedule?.ok) {
    throw new AppError("Configura primero un horario semanal válido.", 409, "STORE_CONFIG_INVALID");
  }

  const today = formatLocalDateKey(now, schedule.config.timezone);
  if (parsed.data.date < today) {
    throw new ValidationError("No puedes configurar una fecha pasada.");
  }

  if (
    parsed.data.mode === "regular_hours" &&
    !schedule.config.days[getExceptionWeekday(parsed.data.date)].enabled
  ) {
    throw new ValidationError(
      "Ese día normalmente está cerrado. Define un horario especial para abrirlo."
    );
  }

  return parsed.data;
}

function evaluateWithDateException(
  snapshot: Awaited<ReturnType<typeof readStoreSnapshot>>,
  now: Date,
  date: string,
  value: StoreDateException | null
): StoreStatus {
  const dateExceptions = { ...snapshot.dateExceptions };
  if (value) dateExceptions[date] = value;
  else delete dateExceptions[date];
  return evaluateStoreStatus({
    now,
    config: snapshot.hoursRaw,
    override: snapshot.operation.override ?? null,
    cashClosedOperationalDate:
      snapshot.status.reasonCode === "CASH_CLOSED" ? snapshot.status.operationalDate : null,
    dateExceptions,
  });
}

export async function updateStoreDateException(
  tenantId: string,
  actor: StoreActor,
  rawException: unknown,
  reason?: string
): Promise<{ changed: boolean; status: StoreStatus; eventId: string | null }> {
  const requested = storeDateExceptionSchema.safeParse(rawException);
  if (!requested.success) throw new ValidationError("Excepción de fecha inválida", requested.error.issues);

  return getDb().runTransaction(async (tx) => {
    const now = new Date();
    const snapshot = await readStoreSnapshot(tenantId, transactionReader(tx), now);
    const exception = validateDateException(snapshot, requested.data, now);
    const ref = storeRefs(tenantId).dateException(exception.date);
    const previousDoc = await tx.get(ref);
    const previousException = previousDoc.exists
      ? storeDateExceptionSchema.safeParse({ date: previousDoc.id, ...previousDoc.data() })
      : null;
    const same = previousException?.success && JSON.stringify(previousException.data) === JSON.stringify(exception);
    if (same) return { changed: false, status: snapshot.status, eventId: null };

    const next = evaluateWithDateException(snapshot, now, exception.date, exception);
    const nowLocalDate = formatLocalDateKey(now, snapshot.timezone);
    const stamp = admin.firestore.FieldValue.serverTimestamp();
    tx.set(ref, {
      ...exception,
      createdAt: previousDoc.exists ? previousDoc.get("createdAt") ?? stamp : stamp,
      createdBy: previousDoc.exists ? previousDoc.get("createdBy") ?? actor : actor,
      updatedAt: stamp,
      updatedBy: actor,
    });

    if (exception.date === nowLocalDate) {
      tx.set(storeRefs(tenantId).operation, {
        lastObservedState: next.state,
        lastObservedOperationalDate: next.operationalDate,
        lastObservedAt: stamp,
      }, { merge: true });
    }

    const eventId = appendStoreEvent(tx, tenantId, {
      type: "special_date_updated",
      source: "manual",
      actor,
      reason: reason?.trim() || exception.customerMessage || "Fecha especial configurada",
      previousState: snapshot.status.state,
      newState: next.state,
      reasonCode: next.reasonCode,
      operationalDate: exception.date,
      metadata: {
        action: "saved",
        date: exception.date,
        previousException: previousDoc.exists ? previousDoc.data() : null,
        newException: exception,
      },
    }, now, snapshot.timezone);

    return { changed: true, status: next, eventId };
  });
}

export async function deleteStoreDateException(
  tenantId: string,
  actor: StoreActor,
  date: string,
  reason?: string
): Promise<{ changed: boolean; status: StoreStatus; eventId: string | null }> {
  return getDb().runTransaction(async (tx) => {
    const now = new Date();
    const snapshot = await readStoreSnapshot(tenantId, transactionReader(tx), now);
    const dateParse = storeDateExceptionSchema.shape.date.safeParse(date);
    if (!dateParse.success) throw new ValidationError("Fecha inválida", dateParse.error.issues);
    const today = formatLocalDateKey(now, snapshot.timezone);
    if (date < today) throw new ValidationError("No puedes eliminar una excepción de fecha pasada.");

    const ref = storeRefs(tenantId).dateException(date);
    const previousDoc = await tx.get(ref);
    if (!previousDoc.exists) return { changed: false, status: snapshot.status, eventId: null };

    const next = evaluateWithDateException(snapshot, now, date, null);
    tx.delete(ref);
    if (date === today) {
      tx.set(storeRefs(tenantId).operation, {
        lastObservedState: next.state,
        lastObservedOperationalDate: next.operationalDate,
        lastObservedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    const eventId = appendStoreEvent(tx, tenantId, {
      type: "special_date_updated",
      source: "manual",
      actor,
      reason: reason?.trim() || "Excepción de fecha eliminada",
      previousState: snapshot.status.state,
      newState: next.state,
      reasonCode: next.reasonCode,
      operationalDate: date,
      metadata: { action: "deleted", date, previousException: previousDoc.data(), newException: null },
    }, now, snapshot.timezone);

    return { changed: true, status: next, eventId };
  });
}
