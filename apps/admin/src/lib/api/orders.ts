import { auth } from "../firebase/client";

const USE_EMULATOR = process.env.NEXT_PUBLIC_USE_EMULATOR === "true";
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
    // `code` permite a la UI distinguir errores de negocio (ej. IDEMPOTENCY_KEY_REUSED).
    throw Object.assign(new Error(msg), { code: data?.error?.code, status: res.status });
  }

  return (data as { ok: true; data: T }).data;
}

/**
 * SEC-BASE/P1-1: cualquier endpoint admin exige un ID token fresco. El token
 * se obtiene por request y nunca se cachea; expirado o inválido lo rechaza
 * el servidor (401/403).
 */
async function authHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Sesión admin expirada. Vuelve a ingresar.");
  }
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
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
}

interface CreateOrderResponse {
  orderId: string;
  tenantId: string;
  displayOrderNumber: number;
  displayCode: string;
  operationalDate: string;
}

export async function createOrderApi(
  payload: CreateOrderPayload
): Promise<CreateOrderResponse> {
  return apiFetch<CreateOrderResponse>(`${FUNCTIONS_BASE}/createOrder`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

interface CreatePosSalePayload {
  tenantId: string;
  items: { productId: string; qty: number }[];
  customer: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    notes?: string;
  };
  fulfillmentType: "delivery" | "pickup";
  paymentMethod: "cash" | "card" | "transfer" | "pending";
  acquisitionSource?: string;
  acquisitionCampaign?: string;
  /** ORDER-IDEMPOTENCY: misma clave en cada reintento de la misma venta. */
  idempotencyKey: string;
}

interface CreatePosSaleResponse {
  orderId: string;
  tenantId: string;
  displayOrderNumber: number;
  displayCode: string;
  operationalDate: string;
  /** true si la venta ya estaba registrada con esta clave (reintento). */
  replayed?: boolean;
}

export interface PosOrderSnapshot {
  id: string;
  displayCode?: string;
  channel?: string;
  fulfillmentType?: "delivery" | "pickup";
  paymentMethod?: "pending" | "cash" | "card" | "transfer";
  acquisitionSource?: "instagram" | "facebook" | "whatsapp" | "in_person" | "other";
  acquisitionCampaign?: string;
  customer?: { name?: string; phone?: string; address?: string; notes?: string };
  items?: { name?: string; qty?: number; unitPrice?: number; subtotal?: number }[];
  totals?: { subtotal?: number; deliveryFee?: number; delivery?: number; discount?: number; total?: number };
}

export async function createPosSaleApi(
  payload: CreatePosSalePayload
): Promise<CreatePosSaleResponse> {
  return apiFetch<CreatePosSaleResponse>(`${FUNCTIONS_BASE}/createPosSale`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });
}

export interface OrderAttemptLookup {
  found: boolean;
  orderId?: string;
  displayOrderNumber?: number;
  displayCode?: string;
  operationalDate?: string;
}

/**
 * ORDER-IDEMPOTENCY (O-01): verifica, sin crear nada, si una venta POS quedó
 * registrada. Exige membresía con `pos.create_sale`.
 */
export async function lookupPosAttemptApi(tenantId: string, idempotencyKey: string): Promise<OrderAttemptLookup> {
  return apiFetch<OrderAttemptLookup>(`${FUNCTIONS_BASE}/lookupOrderAttempt`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ tenantId, channel: "admin_pos", idempotencyKey }),
  });
}

export async function getOrderApi(
  orderId: string,
  tenantId: string
): Promise<PosOrderSnapshot> {
  // SEC-04: lectura privada; exige token y membresía con `orders.read_private`.
  return apiFetch<PosOrderSnapshot>(
    `${FUNCTIONS_BASE}/getOrder/${encodeURIComponent(orderId)}?tenantId=${encodeURIComponent(tenantId)}`,
    { method: "GET", headers: await authHeaders() }
  );
}

type OrderStatus = "queued" | "preparing" | "ready" | "on_the_way" | "delivered" | "cancelled";

interface UpdateOrderStatusResponse {
  orderId: string;
  status: OrderStatus;
}

export async function updateOrderStatusApi(
  orderId: string,
  status: OrderStatus,
  tenantId: string
): Promise<UpdateOrderStatusResponse> {
  const url =
    `${FUNCTIONS_BASE}/updateOrderStatus` +
    `?orderId=${encodeURIComponent(orderId)}&tenantId=${encodeURIComponent(tenantId)}`;
  return apiFetch<UpdateOrderStatusResponse>(url, {
    method: "PATCH",
    headers: await authHeaders(),
    body: JSON.stringify({ status, tenantId }),
  });
}
