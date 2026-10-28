import { auth } from "../firebase/client";

/**
 * FIN-01 — cliente HTTP de confirmación y reversión de transferencias.
 * Contrato: docs/architecture/payment-confirmation-contract.md
 * Exigen membresía activa con `payments.confirm_transfer` / `payments.view`.
 */

const USE_EMULATOR = process.env.NEXT_PUBLIC_USE_EMULATOR === "true";
const FUNCTIONS_BASE = USE_EMULATOR
  ? "/api/functions"
  : (process.env.NEXT_PUBLIC_FUNCTIONS_BASE_URL ??
    "http://127.0.0.1:5001/minerp-sentinel/us-central1");

export class PaymentApiError extends Error {
  constructor(message: string, public code: string | undefined, public status: number, public details?: unknown) {
    super(message);
    this.name = "PaymentApiError";
  }
}

export type PaymentMutationResult = {
  replayed: boolean;
  eventId: string;
  action: "transfer_confirmed" | "transfer_confirmation_reverted";
  orderId: string;
  amount: number;
  effectiveOperationalDate: string;
  currentPaymentStatus: string;
  activeConfirmationEventId: string | null;
  confirmationActive?: boolean;
};

export type PaymentEventRow = {
  id: string;
  orderId: string;
  type: PaymentMutationResult["action"];
  signedAmount: number;
  actor?: { uid: string; email?: string | null; role?: string };
  at?: string;
  atLocal?: string;
  effectiveOperationalDate: string;
  originOperationalDate?: string | null;
  reference?: string | null;
  reason?: string | null;
  reversesEventId?: string | null;
};

async function call<T>(path: string, init: RequestInit): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new PaymentApiError("Sesión admin expirada. Vuelve a ingresar.", "UNAUTHENTICATED", 401);
  const res = await fetch(`${FUNCTIONS_BASE}/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await user.getIdToken()}`,
      ...init.headers,
    },
  });
  const body = (await res.json().catch(() => null)) as
    | { ok: true; data: T }
    | { ok: false; error: { code: string; message: string; details?: unknown } }
    | null;
  if (!res.ok || !body?.ok) {
    const error = body && !body.ok ? body.error : undefined;
    throw new PaymentApiError(error?.message ?? `HTTP ${res.status}`, error?.code, res.status, error?.details);
  }
  return body.data;
}

export function confirmTransferPaymentApi(input: {
  tenantId: string;
  orderId: string;
  expectedAmount: number;
  reference?: string;
  idempotencyKey: string;
}): Promise<PaymentMutationResult> {
  return call("confirmTransferPayment", { method: "POST", body: JSON.stringify(input) });
}

export function revertTransferConfirmationApi(input: {
  tenantId: string;
  orderId: string;
  expectedConfirmationEventId: string;
  reason: string;
  idempotencyKey: string;
}): Promise<PaymentMutationResult> {
  return call("revertTransferConfirmation", { method: "POST", body: JSON.stringify(input) });
}

export function listOrderPaymentEventsApi(tenantId: string, orderId: string) {
  return call<{ events: PaymentEventRow[]; complete: boolean }>(
    `listPaymentEvents?tenantId=${encodeURIComponent(tenantId)}&orderId=${encodeURIComponent(orderId)}`,
    { method: "GET" }
  );
}

export function newPaymentIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `pay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
