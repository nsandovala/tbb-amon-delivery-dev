import { auth } from "../firebase/client";
import { FUNCTIONS_BASE } from "../public-env";
import type {
  ExpenseCategory,
  ExpensePaymentMethod,
} from "../firebase/queries/expenses";

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

interface CreateExpensePayload {
  tenantId: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  paymentMethod?: ExpensePaymentMethod;
  /** ISO 8601 timestamp. Omit to let the backend stamp the server clock. */
  occurredAt?: string;
  notes?: string;
}

interface CreateExpenseResponse {
  expenseId: string;
  tenantId: string;
}

/**
 * Records an operating expense through the createExpense Function.
 * The endpoint is admin-only; this call attaches the current Firebase ID token.
 * The token is fetched per request (not stored) and expired/invalid tokens are
 * rejected server-side.
 */
export async function createExpenseApi(
  payload: CreateExpensePayload
): Promise<CreateExpenseResponse> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Sesión admin expirada. Vuelve a ingresar.");
  }
  const token = await user.getIdToken();

  return apiFetch<CreateExpenseResponse>(`${FUNCTIONS_BASE}/createExpense`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}
