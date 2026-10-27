import { onRequest, type Request } from "firebase-functions/v2/https";
import { updateOrderStatusSchema } from "../schemas/update-order-status.schema";
import { createPosSaleSchema } from "../schemas/create-pos-sale.schema";
import { handleUpdateOrderStatus } from "../services/orders.service";
import { handleCreatePosSale } from "../services/pos.service";
import { requireMembershipPermission } from "../lib/authz";
import { assertBodyWithinLimit } from "../lib/request-limits";
import { ORDER_LIMITS } from "../schemas/order-limits";
import { ValidationError, NotFoundError, AppError } from "../lib/errors";
import { logger } from "../lib/logger";
import type { ApiResponse } from "../types/api";

/**
 * SEC-BASE/P1-1: ambos endpoints son operaciones admin — exigen membresía
 * activa en el tenant y el permiso correspondiente. El tenant debe venir
 * explícito; no hay fallback a `tbb`.
 */
function readTenantFromQueryOrBody(req: Request): string {
  const fromQuery =
    typeof req.query.tenantId === "string" ? req.query.tenantId.trim() : "";
  const fromBody =
    req.body && typeof req.body.tenantId === "string" ? req.body.tenantId.trim() : "";
  return fromQuery || fromBody || "";
}

/**
 * PATCH /orders/:id/status
 * Transitions an order to a new status.
 * Validates transition rules at service/repository layer.
 */
export const updateOrderStatus = onRequest(
  { cors: true },
  async (req, res): Promise<void> => {
    try {
      if (req.method !== "PATCH") {
        res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "PATCH only" } } satisfies ApiResponse);
        return;
      }

      // Support current frontend client (?orderId=...) and path-style invocations.
      const pathSegments = req.path.split("/").filter(Boolean);
      const orderIdFromPath = pathSegments[0];
      const orderIdFromQuery =
        typeof req.query.orderId === "string" ? req.query.orderId : undefined;
      const orderId = orderIdFromQuery || orderIdFromPath;
      if (!orderId) {
        res.status(400).json({ ok: false, error: { code: "MISSING_ID", message: "Order ID required" } } satisfies ApiResponse);
        return;
      }

      const body = req.body;
      if (!body) {
        res.status(400).json({ ok: false, error: { code: "MISSING_BODY", message: "Request body required" } } satisfies ApiResponse);
        return;
      }

      const tenantId = readTenantFromQueryOrBody(req);
      if (!tenantId) {
        throw new ValidationError("tenantId is required");
      }

      await requireMembershipPermission(req, tenantId, "orders.update_status");

      const parsed = updateOrderStatusSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError("Invalid status payload", parsed.error.issues);
      }

      await handleUpdateOrderStatus(tenantId, orderId, parsed.data);

      res.status(200).json({
        ok: true,
        data: { orderId, status: parsed.data.status },
      } satisfies ApiResponse);
    } catch (err) {
      handleError(err, res);
    }
  }
);

/**
 * POST /pos/sale
 * Records a POS sale (creates order with channel=admin_pos).
 */
export const createPosSale = onRequest(
  { cors: true },
  async (req, res): Promise<void> => {
    try {
      if (req.method !== "POST") {
        res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "POST only" } } satisfies ApiResponse);
        return;
      }

      assertBodyWithinLimit(req, ORDER_LIMITS.maxBodyBytes);

      const body = req.body;
      if (!body) {
        res.status(400).json({ ok: false, error: { code: "MISSING_BODY", message: "Request body required" } } satisfies ApiResponse);
        return;
      }

      const tenantId = readTenantFromQueryOrBody(req);
      if (!tenantId) {
        throw new ValidationError("tenantId is required");
      }

      await requireMembershipPermission(req, tenantId, "pos.create_sale");

      const parsed = createPosSaleSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError("Invalid POS sale payload", parsed.error.issues);
      }

      const result = await handleCreatePosSale(tenantId, parsed.data);

      // ORDER-IDEMPOTENCY: 201 al crear; 200 + replayed:true al reproducir un
      // intento ya registrado (mismos identificadores, sin nuevas escrituras).
      res.status(result.replayed ? 200 : 201).json({
        ok: true,
        data: {
          orderId: result.orderId,
          tenantId,
          displayOrderNumber: result.displayOrderNumber,
          displayCode: result.displayCode,
          operationalDate: result.operationalDate,
          replayed: result.replayed,
        },
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

  if (err instanceof NotFoundError) {
    res.status(404).json({
      ok: false,
      error: { code: err.code, message: err.message },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      ok: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  logger.error("Unhandled error", { error: String(err) });
  res.status(500).json({
    ok: false,
    error: { code: "INTERNAL_ERROR", message: "Internal server error" },
  });
}
