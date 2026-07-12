import type {
  ExpenseCategory,
  ExpensePaymentMethod,
} from "../firebase/queries/expenses";

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

interface CreateExpensePayload {
  tenantId?: string;
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
 * Firestore rules deny direct client writes to tenants/{tenantId}/expenses,
 * so this HTTP call is the only write path from the admin.
 */
export async function createExpenseApi(
  payload: CreateExpensePayload
): Promise<CreateExpenseResponse> {
  return apiFetch<CreateExpenseResponse>(`${FUNCTIONS_BASE}/createExpense`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
