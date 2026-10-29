import admin from "firebase-admin";
import { getDb } from "../lib/firebase-admin";
import {
  DEFAULT_STORE_TIMEZONE,
  evaluateStoreStatus,
  formatLocalDateKey,
  formatLocalIso,
  getOperationalDateFor,
  parseStoreHoursConfig,
  type StoreActor,
  type StoreState,
  type StoreStatus,
  type StoreDateException,
} from "../lib/store-hours";

/**
 * M6J — Firestore paths for store operation and cash close.
 *
 *   tenants/{tenantId}/settings/storeHours        editable schedule (config)
 *   tenants/{tenantId}/settings/storeOperation    active manual override + last observed state
 *   tenants/{tenantId}/storeEvents/{eventId}      append-only audit log
 *   tenants/{tenantId}/cashCloses/{operationalDate} immutable cash close, one per day
 *   tenants/{tenantId}/orderCounters/{operationalDate} per-day control doc (FIN-01 adds `payments`)
 *   tenants/{tenantId}/paymentEvents/{eventId}  FIN-01 append-only transfer ledger
 *
 * Firestore rules are unchanged: storeEvents and cashCloses fall under the
 * global deny, so they are only reachable through admin Functions.
 */

export const STORE_HOURS_DOC = "storeHours";
export const STORE_OPERATION_DOC = "storeOperation";

type StoreReaderRef = admin.firestore.DocumentReference | admin.firestore.Query;
type StoreReaderResult = admin.firestore.DocumentSnapshot | admin.firestore.QuerySnapshot;
type StoreReader = {
  (ref: admin.firestore.DocumentReference): Promise<admin.firestore.DocumentSnapshot>;
  (ref: admin.firestore.Query): Promise<admin.firestore.QuerySnapshot>;
};

export function storeRefs(tenantId: string) {
  const tenant = getDb().collection("tenants").doc(tenantId);
  return {
    hours: tenant.collection("settings").doc(STORE_HOURS_DOC),
    operation: tenant.collection("settings").doc(STORE_OPERATION_DOC),
    events: tenant.collection("storeEvents"),
    dateExceptions: tenant.collection("storeExceptions"),
    dateException: (date: string) => tenant.collection("storeExceptions").doc(date),
    cashCloses: tenant.collection("cashCloses"),
    cashClose: (operationalDate: string) => tenant.collection("cashCloses").doc(operationalDate),
    orderCounter: (operationalDate: string) => tenant.collection("orderCounters").doc(operationalDate),
    paymentEvents: tenant.collection("paymentEvents"),
    orders: tenant.collection("orders"),
    expenses: tenant.collection("expenses"),
  };
}

export const plainReader: StoreReader = ((ref: StoreReaderRef) => ref.get()) as StoreReader;

export function transactionReader(tx: admin.firestore.Transaction): StoreReader {
  return ((ref: StoreReaderRef) => tx.get(ref as admin.firestore.Query)) as StoreReader;
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
  dateExceptions: Record<string, unknown>;
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
  read: StoreReader,
  now: Date
): Promise<StoreSnapshot> {
  const refs = storeRefs(tenantId);
  const [hoursResult, operationResult] = await Promise.all([
    read(refs.hours),
    read(refs.operation),
  ]);

  const hoursSnap = hoursResult as admin.firestore.DocumentSnapshot;
  const operationSnap = operationResult as admin.firestore.DocumentSnapshot;

  const hoursRaw = hoursSnap.exists
    ? ((hoursSnap.data() ?? null) as Record<string, unknown> | null)
    : null;
  const operation = (operationSnap.exists ? operationSnap.data() : {}) as StoreOperationDoc;

  const parsed = hoursRaw ? parseStoreHoursConfig(hoursRaw) : null;
  const timezone = parsed?.ok ? parsed.config.timezone : DEFAULT_STORE_TIMEZONE;

  const localDate = formatLocalDateKey(now, timezone);
  const endDateValue = new Date(`${localDate}T12:00:00.000Z`);
  endDateValue.setUTCDate(endDateValue.getUTCDate() + 8);
  const endDate = endDateValue.toISOString().slice(0, 10);
  const exceptionsQuery = refs.dateExceptions
    .orderBy(admin.firestore.FieldPath.documentId())
    .startAt(localDate)
    .endAt(endDate);
  const exceptionsResult = await read(exceptionsQuery);
  const exceptionsSnapshot = exceptionsResult as admin.firestore.QuerySnapshot;
  const dateExceptions = Object.fromEntries(
    exceptionsSnapshot.docs.map((doc) => [doc.id, { date: doc.id, ...doc.data() }])
  );

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
    dateExceptions,
  });

  return { status, hoursRaw, operation, timezone, dateExceptions };
}

export type StoreEventType =
  | "schedule_transition"
  | "store_opened"
  | "store_closed"
  | "store_reopened"
  | "schedule_resumed"
  | "hours_updated"
  | "special_date_updated"
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

export async function listUpcomingStoreDateExceptions(
  tenantId: string,
  fromDate: string,
  throughDate?: string,
  limit?: number
): Promise<Array<StoreDateException & Record<string, unknown>>> {
  let query = storeRefs(tenantId).dateExceptions
    .orderBy(admin.firestore.FieldPath.documentId())
    .startAt(fromDate);
  if (throughDate) query = query.endAt(throughDate);
  if (limit !== undefined) query = query.limit(limit);
  const snapshot = await query.get();
  return snapshot.docs.map((doc) => ({
    date: doc.id,
    ...serializeFirestore(doc.data()) as Record<string, unknown>,
  })) as Array<StoreDateException & Record<string, unknown>>;
}
