import { onRequest, type Request } from "firebase-functions/v2/https";
import { createExpenseSchema } from "../schemas/expense.schema";
import { handleCreateExpense } from "../services/expenses.service";
import { requireMembershipPermission } from "../lib/authz";
import { ValidationError, AppError } from "../lib/errors";
import { logger } from "../lib/logger";
import type { ApiResponse } from "../types/api";

/**
 * SEC-BASE: operación privada. El tenant es obligatorio y explícito en el
 * body — ya no hay fallback silencioso al pilot. La autorización se resuelve
 * contra `tenants/{tenantId}/members/{uid}` con el permiso `expenses.create`.
 */
function resolveTenantFromBody(req: Request): string | null {
  const raw = req.body && typeof req.body.tenantId === "string" ? req.body.tenantId.trim() : "";
  return raw.length > 0 ? raw : null;
}

/**
 * POST /createExpense
 * Admin-only: requiere membresía activa con `expenses.create` en el tenant.
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

      const tenantId = resolveTenantFromBody(req);
      if (!tenantId) {
        throw new ValidationError("tenantId is required");
      }

      // Autorización ANTES de validar el payload: así una payload inválida de
      // un no-autorizado se trata como 403 (no filtra la forma del contrato).
      const actor = await requireMembershipPermission(req, tenantId, "expenses.create");

      const parsed = createExpenseSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError("Invalid expense payload", parsed.error.issues);
      }

      const result = await handleCreateExpense(actor.tenantId, parsed.data, actor);

      res.status(201).json({
        ok: true,
        data: { expenseId: result.expenseId, tenantId: actor.tenantId },
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
