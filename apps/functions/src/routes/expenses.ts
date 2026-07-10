import { onRequest } from "firebase-functions/v2/https";
import { createExpenseSchema } from "../schemas/expense.schema";
import { handleCreateExpense } from "../services/expenses.service";
import { ValidationError, AppError } from "../lib/errors";
import { logger } from "../lib/logger";
import type { ApiResponse } from "../types/api";

const DEFAULT_TENANT = "tbb";

/**
 * POST /expenses
 * Records an operating expense in tenants/{tenantId}/expenses.
 * This is the only write path: Firestore rules deny direct client writes.
 */
export const createExpense = onRequest(
  { cors: true },
  async (req, res): Promise<void> => {
    try {
      if (req.method !== "POST") {
        res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "POST only" } } satisfies ApiResponse);
        return;
      }

      const body = req.body;
      if (!body) {
        res.status(400).json({ ok: false, error: { code: "MISSING_BODY", message: "Request body required" } } satisfies ApiResponse);
        return;
      }

      const parsed = createExpenseSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError("Invalid expense payload", parsed.error.issues);
      }

      const tenantId = parsed.data.tenantId || DEFAULT_TENANT;
      const result = await handleCreateExpense(tenantId, parsed.data);

      res.status(201).json({
        ok: true,
        data: { expenseId: result.expenseId, tenantId },
      } satisfies ApiResponse);
    } catch (err) {
      handleError(err, res);
    }
  }
);

function handleError(err: unknown, res: { status: (code: number) => { json: (body: ApiResponse) => void } }): void {
  if (err instanceof ValidationError) {
    res.status(400).json({
      ok: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      ok: false,
      error: { code: err.code, message: err.message },
    });
    return;
  }

  logger.error("Unhandled error", { error: String(err) });
  res.status(500).json({
    ok: false,
    error: { code: "INTERNAL_ERROR", message: "Internal server error" },
  });
}
