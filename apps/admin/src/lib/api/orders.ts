//import { db } from "../firebase/client";

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
    throw new Error(msg);
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
  tenantId?: string;
  items: { productId: string; qty: number }[];
  customer: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    notes?: string;
  };
  fulfillmentType?: "delivery" | "pickup";
  paymentMethod?: "pending" | "cash" | "card" | "transfer";
}

interface CreatePosSaleResponse {
  orderId: string;
  tenantId: string;
  displayOrderNumber: number;
  displayCode: string;
  operationalDate: string;
}

export async function createPosSaleApi(
  payload: CreatePosSalePayload
): Promise<CreatePosSaleResponse> {
  return apiFetch<CreatePosSaleResponse>(`${FUNCTIONS_BASE}/createPosSale`, {
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
