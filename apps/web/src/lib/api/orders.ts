const HAS_EXPLICIT_FUNCTIONS_BASE = Boolean(
  process.env.NEXT_PUBLIC_FUNCTIONS_BASE_URL
);
const USE_EMULATOR =
  process.env.NEXT_PUBLIC_USE_EMULATOR === "true" ||
  (process.env.NODE_ENV === "development" && !HAS_EXPLICIT_FUNCTIONS_BASE);
const FUNCTIONS_BASE = USE_EMULATOR
  ? "/api/functions"
  : (process.env.NEXT_PUBLIC_FUNCTIONS_BASE_URL ??
    "http://127.0.0.1:5001/minerp-sentinel/us-central1");

interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

async function apiFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const raw = await res.text();
  let data: { ok: boolean; data?: T; error?: ApiError["error"] } | undefined;

  if (raw) {
    try {
      data = JSON.parse(raw) as { ok: boolean; data?: T; error?: ApiError["error"] };
    } catch {
      data = undefined;
    }
  }

  if (!res.ok || !data?.ok) {
    const msg =
      data?.error?.message ??
      (process.env.NODE_ENV === "development"
        ? `HTTP ${res.status} ${res.statusText} for ${url}${raw ? ` :: ${raw.slice(0, 300)}` : ""}`
        : `HTTP ${res.status}`);
    // `code` permite a la UI distinguir errores de negocio (ej. STORE_CLOSED, M6J).
    throw Object.assign(new Error(msg), { code: data?.error?.code, status: res.status });
  }

  return (data as { ok: true; data: T }).data;
}

interface CreateOrderPayload {
  tenantId?: string;
  items: { productId: string; qty: number }[];
  customer: {
    name: string;
    phone: string;
    email?: string;
    address?: string;
    notes?: string;
  };
  fulfillmentType: "delivery" | "pickup";
  paymentMethod?: "pending" | "cash" | "card" | "transfer";
  /** ORDER-IDEMPOTENCY: misma clave en cada reintento del mismo intento. */
  idempotencyKey: string;
}

interface CreateOrderResponse {
  orderId: string;
  tenantId: string;
  displayOrderNumber: number;
  displayCode: string;
  operationalDate: string;
  /** true si el pedido ya estaba registrado con esta clave (reintento). */
  replayed?: boolean;
}

export type PublicStoreDateException = {
  date: string;
  mode: "closed" | "regular_hours" | "custom_hours";
  open?: string;
  close?: string;
  customerMessage?: string;
};

export type PublicStoreAvailability = {
  state: string;
  acceptingOrders: boolean;
  timezone: string;
  localNow: string;
  override: { mode: "open" | "closed" } | null;
  specialDate: PublicStoreDateException | null;
  upcomingSpecialDates: PublicStoreDateException[];
};

export function fetchPublicStoreAvailability(tenantId: string): Promise<PublicStoreAvailability> {
  return apiFetch<PublicStoreAvailability>(
    `${FUNCTIONS_BASE}/getStoreStatus?tenantId=${encodeURIComponent(tenantId)}`
  );
}

export interface OrderAttemptLookup {
  found: boolean;
  orderId?: string;
  displayOrderNumber?: number;
  displayCode?: string;
  operationalDate?: string;
}

/**
 * ORDER-IDEMPOTENCY (O-01): verifica, sin crear nada, si un intento quedó
 * registrado. Solo devuelve identificadores del pedido.
 */
export function lookupOrderAttemptApi(tenantId: string, idempotencyKey: string): Promise<OrderAttemptLookup> {
  return apiFetch<OrderAttemptLookup>(`${FUNCTIONS_BASE}/lookupOrderAttempt`, {
    method: "POST",
    body: JSON.stringify({ tenantId, channel: "web", idempotencyKey }),
  });
}

export async function createOrderApi(
  payload: CreateOrderPayload
): Promise<CreateOrderResponse> {
  return apiFetch<CreateOrderResponse>(`${FUNCTIONS_BASE}/createOrder`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

interface UpdateOrderStatusPayload {
  status: "queued" | "preparing" | "ready" | "on_the_way" | "delivered" | "cancelled";
}

interface UpdateOrderStatusResponse {
  orderId: string;
  status: UpdateOrderStatusPayload["status"];
}

export async function updateOrderStatusApi(
  orderId: string,
  status: UpdateOrderStatusPayload["status"]
): Promise<UpdateOrderStatusResponse> {
  return apiFetch<UpdateOrderStatusResponse>(
    `${FUNCTIONS_BASE}/updateOrderStatus?orderId=${orderId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }
  );
}
