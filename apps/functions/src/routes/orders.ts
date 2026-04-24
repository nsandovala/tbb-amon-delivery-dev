import { onRequest } from "firebase-functions/v2/https";
import { createOrderSchema } from "../schemas/create-order.schema";
import { handleCreateOrder, handleGetOrder } from "../services/orders.service";
import { ValidationError, AppError } from "../lib/errors";
import { logger } from "../lib/logger";
import type { ApiResponse } from "../types/api";

const DEFAULT_TENANT = "tbb";

/**
 * POST /orders
 * Creates a new order in tenants/{tenantId}/orders.
 */
export const createOrder = onRequest(
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

      const parsed = createOrderSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError("Invalid order payload", parsed.error.issues);
      }

      const tenantId = parsed.data.tenantId || DEFAULT_TENANT;
      const result = await handleCreateOrder(tenantId, parsed.data);

      res.status(201).json({
        ok: true,
        data: { orderId: result.orderId, tenantId },
      } satisfies ApiResponse);
    } catch (err) {
      handleError(err, res);
    }
  }
);

/**
 * GET /orders/:id
 * Reads an order from tenants/{tenantId}/orders.
 * tenantId passed as query param or defaults to pilot tenant.
 */
export const getOrder = onRequest(
  { cors: true },
  async (req, res): Promise<void> => {
    try {
      const orderId = req.path.split("/").pop();
      if (!orderId) {
        res.status(400).json({ ok: false, error: { code: "MISSING_ID", message: "Order ID required" } } satisfies ApiResponse);
        return;
      }

      const tenantId = (req.query.tenantId as string) || DEFAULT_TENANT;
      const order = await handleGetOrder(tenantId, orderId);

      res.status(200).json({ ok: true, data: order } satisfies ApiResponse);
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
