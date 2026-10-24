import { auth } from "../firebase/client";

/**
 * M6J — cliente HTTP de horario operativo y cierre de caja.
 * Los endpoints de control exigen ID token con claim `admin` (mismo claim que AdminGuard).
 * Contrato: docs/architecture/store-operation-contract.md
 */

const USE_EMULATOR = process.env.NEXT_PUBLIC_USE_EMULATOR === "true";
const FUNCTIONS_BASE = USE_EMULATOR
  ? "/api/functions"
  : (process.env.NEXT_PUBLIC_FUNCTIONS_BASE_URL ??
    "http://127.0.0.1:5001/minerp-sentinel/us-central1");

export type StoreState =
  | "scheduled_closed"
  | "scheduled_open"
  | "manual_open"
  | "manual_closed"
  | "closing"
  | "closed";

export type Weekday =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

export type DaySchedule = { enabled: boolean; open: string; close: string };

export type StoreHoursConfig = {
  timezone: string;
  closingWarningMinutes: number;
  days: Record<Weekday, DaySchedule>;
};

export type StoreDateException = {
  date: string;
  mode: "closed" | "regular_hours" | "custom_hours";
  open?: string;
  close?: string;
  customerMessage?: string;
  createdAt?: string | null;
  createdBy?: StoreActor | null;
  updatedAt?: string | null;
  updatedBy?: StoreActor | null;
};

export type StoreActor = { uid: string; email?: string | null };

export type StoreStatus = {
  state: StoreState;
  acceptingOrders: boolean;
  source: "schedule" | "manual" | "system";
  reasonCode: string;
  message: string;
  timezone: string;
  localNow: string;
  localTime: string;
  weekday: Weekday | null;
  operationalDate: string | null;
  today: (DaySchedule & { weekday: Weekday }) | null;
  specialDate: Omit<StoreDateException, "createdAt" | "createdBy" | "updatedAt" | "updatedBy"> | null;
  nextOpenAt: string | null;
  nextCloseAt: string | null;
  override: {
    mode: "open" | "closed";
    operationalDate?: string;
    reason?: string | null;
    actor?: StoreActor | null;
    at?: string | null;
  } | null;
  configValid: boolean;
  configErrors?: string[];
};

export type StoreEvent = {
  id: string;
  type: string;
  source: "schedule" | "manual";
  actor: StoreActor | null;
  reason: string | null;
  previousState: StoreState | null;
  newState: StoreState;
  reasonCode: string | null;
  operationalDate: string | null;
  metadata: Record<string, unknown> | null;
  at: string | null;
  atLocal: string;
};

export type StoreControl = {
  status: StoreStatus;
  config: StoreHoursConfig | null;
  configUpdatedAt: string | null;
  configUpdatedBy: StoreActor | null;
  defaultConfig: StoreHoursConfig;
  events: StoreEvent[];
  specialDates: StoreDateException[];
};

export type PublicStoreStatus = Omit<StoreStatus, "override"> & {
  override: { mode: "open" | "closed" } | null;
  upcomingSpecialDates: Array<Omit<StoreDateException, "createdAt" | "createdBy" | "updatedAt" | "updatedBy">>;
};

export type CashBucket = { count: number; total: number };

export type CashCloseBlocker = CashBucket & {
  code: "ACTIVE_POS_SALES" | "ACTIVE_OTHER_ORDERS" | "PENDING_PAYMENTS";
  orderIds: string[];
  displayCodes: string[];
};

export type CashCloseSummary = {
  operationalDate: string;
  ordersCount: number;
  cancelledCount: number;
  cashSales: CashBucket;
  transferSales: CashBucket;
  cardSales: CashBucket;
  pendingSales: CashBucket;
  activePosSales: CashBucket;
  activeOtherOrders: CashBucket;
  activeExpenses: CashBucket;
  cashExpenses: CashBucket;
  expectedCash: number;
  expectedTransfers: number;
  blockers: CashCloseBlocker[];
};

export type CashCloseRecord = {
  operationalDate: string;
  countedCash: number;
  transfersConfirmed: number;
  expectedCash: number;
  expectedTransfers: number;
  cashDifference: number;
  transferDifference: number;
  observation: string | null;
  override: { reason: string } | null;
  closedBy: StoreActor;
  closedAtLocal: string;
};

export type CashCloseDay = {
  operationalDate: string;
  isCurrentOperationalDay: boolean;
  timezone: string;
  window: { start: string; end: string };
  summary: CashCloseSummary;
  close: CashCloseRecord | null;
  storeState: StoreState;
};

export class StoreApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public details?: unknown
  ) {
    super(message);
    this.name = "StoreApiError";
  }
}

async function storeFetch<T>(
  path: string,
  options: RequestInit & { admin?: boolean } = {}
): Promise<T> {
  const { admin = true, ...init } = options;
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (admin) {
    const user = auth.currentUser;
    if (!user) throw new StoreApiError("Sesión admin expirada. Vuelve a ingresar.", "UNAUTHENTICATED", 401);
    headers.Authorization = `Bearer ${await user.getIdToken()}`;
  }

  const res = await fetch(`${FUNCTIONS_BASE}/${path}`, { ...init, headers });
  const raw = await res.text();
  let body:
    | { ok: boolean; data?: T; error?: { code: string; message: string; details?: unknown } }
    | undefined;
  try {
    body = raw ? JSON.parse(raw) : undefined;
  } catch {
    body = undefined;
  }

  if (!res.ok || !body?.ok) {
    throw new StoreApiError(
      body?.error?.message ?? `HTTP ${res.status}`,
      body?.error?.code ?? "HTTP_ERROR",
      res.status,
      body?.error?.details
    );
  }

  return body.data as T;
}

/**
 * SEC-BASE/P1-3: todas las funciones aceptan `tenantId` explícito. El cliente
 * resuelve el tenant desde el contexto de membresía (`useActiveTenant`) y
 * nunca lo asume.
 */

/** Público: el mismo estado que ve el storefront. Sin token. */
export function fetchStoreStatus(tenantId: string): Promise<PublicStoreStatus> {
  return storeFetch<PublicStoreStatus>(
    `getStoreStatus?tenantId=${encodeURIComponent(tenantId)}`,
    { admin: false }
  );
}

export function fetchStoreControl(tenantId: string): Promise<StoreControl> {
  return storeFetch<StoreControl>(
    `getStoreControl?tenantId=${encodeURIComponent(tenantId)}`
  );
}

export function setStoreOperationApi(
  tenantId: string,
  action: "open" | "close" | "resume_schedule",
  reason?: string
): Promise<{ changed: boolean; status: StoreStatus }> {
  return storeFetch(`setStoreOperation`, {
    method: "POST",
    body: JSON.stringify({ tenantId, action, reason: reason || undefined }),
  });
}

export function updateStoreHoursApi(
  tenantId: string,
  config: StoreHoursConfig,
  reason?: string
): Promise<{ status: StoreStatus }> {
  return storeFetch(`updateStoreHours`, {
    method: "POST",
    body: JSON.stringify({ tenantId, config, reason: reason || undefined }),
  });
}

export function updateStoreDateExceptionApi(
  tenantId: string,
  exception: Omit<StoreDateException, "createdAt" | "createdBy" | "updatedAt" | "updatedBy">,
  reason?: string
): Promise<{ changed: boolean; status: StoreStatus }> {
  return storeFetch("updateStoreDateException", {
    method: "POST",
    body: JSON.stringify({ tenantId, exception, reason: reason || undefined }),
  });
}

export function deleteStoreDateExceptionApi(
  tenantId: string,
  date: string,
  reason?: string
): Promise<{ changed: boolean }> {
  return storeFetch("deleteStoreDateException", {
    method: "POST",
    body: JSON.stringify({ tenantId, date, reason: reason || undefined }),
  });
}

export function fetchCashCloseDay(
  tenantId: string,
  operationalDate?: string
): Promise<CashCloseDay> {
  const date = operationalDate ? `&operationalDate=${operationalDate}` : "";
  return storeFetch<CashCloseDay>(
    `getCashCloseSummary?tenantId=${encodeURIComponent(tenantId)}${date}`
  );
}

export function closeCashSessionApi(
  tenantId: string,
  input: {
    operationalDate: string;
    countedCash: number;
    transfersConfirmed: number;
    observation?: string;
    overrideReason?: string;
    idempotencyKey: string;
  }
): Promise<{ replayed: boolean; close: CashCloseRecord }> {
  return storeFetch(`closeCashSession`, {
    method: "POST",
    body: JSON.stringify({
      tenantId,
      operationalDate: input.operationalDate,
      countedCash: input.countedCash,
      transfersConfirmed: input.transfersConfirmed,
      observation: input.observation || undefined,
      override: input.overrideReason ? { reason: input.overrideReason } : undefined,
      idempotencyKey: input.idempotencyKey,
    }),
  });
}
