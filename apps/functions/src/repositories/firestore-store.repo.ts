import admin from "firebase-admin";
import { getDb } from "../lib/firebase-admin";
import {
  DEFAULT_STORE_TIMEZONE,
  evaluateStoreStatus,
  formatLocalIso,
  getOperationalDateFor,
  parseStoreHoursConfig,
  type StoreActor,
  type StoreState,
  type StoreStatus,
} from "../lib/store-hours";

/**
 * M6J — Firestore paths for store operation and cash close.
 *
 *   tenants/{tenantId}/settings/storeHours        editable schedule (config)
 *   tenants/{tenantId}/settings/storeOperation    active manual override + last observed state
 *   tenants/{tenantId}/storeEvents/{eventId}      append-only audit log
 *   tenants/{tenantId}/cashCloses/{operationalDate} immutable cash close, one per day
 *
 * Firestore rules are unchanged: storeEvents and cashCloses fall under the
 * global deny, so they are only reachable through admin Functions.
 */

export const STORE_HOURS_DOC = "storeHours";
export const STORE_OPERATION_DOC = "storeOperation";

export function storeRefs(tenantId: string) {
  const tenant = getDb().collection("tenants").doc(tenantId);
  return {
    hours: tenant.collection("settings").doc(STORE_HOURS_DOC),
    operation: tenant.collection("settings").doc(STORE_OPERATION_DOC),
    events: tenant.collection("storeEvents"),
    cashCloses: tenant.collection("cashCloses"),
    cashClose: (operationalDate: string) => tenant.collection("cashCloses").doc(operationalDate),
    orders: tenant.collection("orders"),
    expenses: tenant.collection("expenses"),
  };
}

type DocReader = (
  ref: admin.firestore.DocumentReference
) => Promise<admin.firestore.DocumentSnapshot>;

export const plainReader: DocReader = (ref) => ref.get();

export function transactionReader(tx: admin.firestore.Transaction): DocReader {
  return (ref) => tx.get(ref);
}

export type StoreOperationDoc = {
  override?: unknown;
  lastObservedState?: StoreState;
  lastObservedOperationalDate?: string | null;
};

export type StoreSnapshot = {
  status: StoreStatus;
  /** Raw schedule doc (may be invalid) or null when missing. */
  hoursRaw: Record<string, unknown> | null;
  operation: StoreOperationDoc;
  /** Timezone used to resolve operational dates (config tz, or default when invalid). */
  timezone: string;
};

/**
 * Reads schedule + override + today's cash close and evaluates the effective
 * state. Works inside a transaction (pass `transactionReader(tx)`) so order
 * creation and manual actions serialize against each other.
 */
export async function readStoreSnapshot(
  tenantId: string,
  read: DocReader,
  now: Date
): Promise<StoreSnapshot> {
  const refs = storeRefs(tenantId);
  const [hoursSnap, operationSnap] = await Promise.all([
    read(refs.hours),
    read(refs.operation),
  ]);

  const hoursRaw = hoursSnap.exists
    ? ((hoursSnap.data() ?? null) as Record<string, unknown> | null)
    : null;
  const operation = (operationSnap.exists ? operationSnap.data() : {}) as StoreOperationDoc;

  const parsed = hoursRaw ? parseStoreHoursConfig(hoursRaw) : null;
  const timezone = parsed?.ok ? parsed.config.timezone : DEFAULT_STORE_TIMEZONE;

  let cashClosedOperationalDate: string | null = null;
  if (parsed?.ok) {
    const operationalDate = getOperationalDateFor(now, timezone);
    const cashSnap = await read(refs.cashClose(operationalDate));
    if (cashSnap.exists) cashClosedOperationalDate = operationalDate;
  }

  const status = evaluateStoreStatus({
    now,
    config: hoursRaw,
    override: operation.override ?? null,
    cashClosedOperationalDate,
  });

  return { status, hoursRaw, operation, timezone };
}

export type StoreEventType =
  | "schedule_transition"
  | "store_opened"
  | "store_closed"
  | "store_reopened"
  | "schedule_resumed"
  | "hours_updated"
  | "cash_closed";

export type StoreEventInput = {
  type: StoreEventType;
  source: "schedule" | "manual";
  actor: StoreActor | null;
  reason: string | null;
  previousState: StoreState | null;
  newState: StoreState;
  reasonCode?: string;
  operationalDate: string | null;
  metadata?: Record<string, unknown>;
};

/** Appends an audit event. Events are never updated or deleted. */
export function appendStoreEvent(
  tx: admin.firestore.Transaction,
  tenantId: string,
  event: StoreEventInput,
  now: Date,
  timezone: string
): string {
  const ref = storeRefs(tenantId).events.doc();
  tx.create(ref, {
    id: ref.id,
    tenantId,
    ...event,
    reasonCode: event.reasonCode ?? null,
    metadata: event.metadata ?? null,
    at: admin.firestore.FieldValue.serverTimestamp(),
    atLocal: formatLocalIso(now, timezone),
  });
  return ref.id;
}

/** Converts Firestore Timestamps (recursively) to ISO strings for JSON responses. */
export function serializeFirestore(value: unknown): unknown {
  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(serializeFirestore);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        serializeFirestore(entry),
      ])
    );
  }
  return value;
}
