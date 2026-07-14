import { onRequest } from "firebase-functions/v2/https";
import { updateOrderStatusSchema } from "../schemas/update-order-status.schema";
import { createPosSaleSchema } from "../schemas/create-pos-sale.schema";
import { handleUpdateOrderStatus } from "../services/orders.service";
import { handleCreatePosSale } from "../services/pos.service";
import { ValidationError, NotFoundError, AppError } from "../lib/errors";
import { logger } from "../lib/logger";
import type { ApiResponse } from "../types/api";

const DEFAULT_TENANT = "tbb";

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

      const parsed = updateOrderStatusSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError("Invalid status payload", parsed.error.issues);
      }

      const tenantId = DEFAULT_TENANT;

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

      const body = req.body;
      if (!body) {
        res.status(400).json({ ok: false, error: { code: "MISSING_BODY", message: "Request body required" } } satisfies ApiResponse);
        return;
      }

      const parsed = createPosSaleSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError("Invalid POS sale payload", parsed.error.issues);
      }

      const tenantId = parsed.data.tenantId || DEFAULT_TENANT;
      const result = await handleCreatePosSale(tenantId, parsed.data);

      res.status(201).json({
        ok: true,
        data: {
          orderId: result.orderId,
          tenantId,
          displayOrderNumber: result.displayOrderNumber,
          displayCode: result.displayCode,
          operationalDate: result.operationalDate,
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
