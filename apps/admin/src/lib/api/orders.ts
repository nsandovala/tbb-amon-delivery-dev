//import { db } from "../firebase/client";

const FUNCTIONS_BASE =
  process.env.NEXT_PUBLIC_FUNCTIONS_BASE_URL ?? "http://localhost:5001/minerp-sentinel/amon-functions";

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

  const data = await res.json() as { ok: boolean; data?: T; error?: ApiError["error"] };

  if (!res.ok || !data.ok) {
    const msg = data.error?.message ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return (data as { ok: true; data: T }).data as T;
}

interface CreateOrderPayload {
  tenantId?: string;
  items: { productId: string; qty: number }[];
  customer: {
    name: string;
    phone: string;
    address?: string;
    notes?: string;
  };
  fulfillmentType: "delivery" | "pickup";
  paymentMethod?: "pending" | "cash" | "card" | "transfer";
}

interface CreateOrderResponse {
  orderId: string;
  tenantId: string;
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
    phone: string;
    address?: string;
    notes?: string;
  };
  paymentMethod?: "pending" | "cash" | "card" | "transfer";
}

interface CreatePosSaleResponse {
  orderId: string;
  tenantId: string;
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