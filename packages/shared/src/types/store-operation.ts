/**
 * M6J — Contrato de horario operativo, operación manual y cierre de caja.
 *
 * Fuente de enforcement: `apps/functions/src/lib/store-hours.ts` y
 * `apps/functions/src/lib/cash-close.ts` (Functions no puede importar este
 * paquete ESM en runtime; mantener ambos en sync).
 * Documentación: `docs/architecture/store-operation-contract.md`.
 */

export const STORE_STATES = [
  "scheduled_closed",
  "scheduled_open",
  "manual_open",
  "manual_closed",
  "closing",
  "closed",
] as const;
export type StoreState = (typeof STORE_STATES)[number];

/** Estados en los que el backend acepta `createOrder` y `createPosSale`. */
export const STORE_ACCEPTING_STATES: StoreState[] = ["scheduled_open", "closing", "manual_open"];

export const STORE_WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;
export type StoreWeekday = (typeof STORE_WEEKDAYS)[number];

export type StoreDaySchedule = {
  enabled: boolean;
  /** HH:MM 24h, hora local de `timezone`. Inclusivo. */
  open: string;
  /** HH:MM 24h, debe ser > open (sin ventanas que crucen medianoche). Exclusivo. */
  close: string;
};

/** `tenants/{tenantId}/settings/storeHours` */
export type StoreHoursConfig = {
  timezone: string;
  closingWarningMinutes: number;
  days: Record<StoreWeekday, StoreDaySchedule>;
};

export type StoreActor = { uid: string; email?: string | null };

/** `tenants/{tenantId}/settings/storeOperation.override` — vale solo para su día operacional. */
export type StoreOverride = {
  mode: "open" | "closed";
  operationalDate: string;
  reason?: string | null;
  actor?: StoreActor | null;
  at?: string | null;
};

export type StoreEventType =
  | "schedule_transition"
  | "store_opened"
  | "store_closed"
  | "store_reopened"
  | "schedule_resumed"
  | "hours_updated"
  | "cash_closed";

/** `tenants/{tenantId}/storeEvents/{eventId}` — append-only. */
export type StoreEvent = {
  id: string;
  tenantId: string;
  type: StoreEventType;
  source: "schedule" | "manual";
  actor: StoreActor | null;
  reason: string | null;
  previousState: StoreState | null;
  newState: StoreState;
  reasonCode: string | null;
  operationalDate: string | null;
  metadata: Record<string, unknown> | null;
  at: unknown;
  /** ISO 8601 con offset de America/Santiago (varía por DST). */
  atLocal: string;
};

export type CashBucket = { count: number; total: number };

/** `tenants/{tenantId}/cashCloses/{operationalDate}` — inmutable, uno por día operacional. */
export type CashClose = {
  id: string;
  tenantId: string;
  operationalDate: string;
  timezone: string;
  status: "closed";
  countedCash: number;
  transfersConfirmed: number;
  expectedCash: number;
  expectedTransfers: number;
  cashDifference: number;
  transferDifference: number;
  pendingSales: CashBucket;
  activeExpenses: CashBucket;
  observation: string | null;
  override: { reason: string; blockers: unknown[]; actor: StoreActor } | null;
  summary: Record<string, unknown>;
  closedBy: StoreActor;
  closedAt: unknown;
  closedAtLocal: string;
  idempotencyKey: string;
  storeStateBefore: StoreState;
};
