import { onRequest } from "firebase-functions/v2/https";
import { createOrderSchema } from "../schemas/create-order.schema";
import { handleCreateOrder, handleGetOrder } from "../services/orders.service";
import { ValidationError, AppError } from "../lib/errors";
import { requireMembershipPermission } from "../lib/authz";
import { assertBodyWithinLimit } from "../lib/request-limits";
import { ORDER_LIMITS } from "../schemas/order-limits";
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

      assertBodyWithinLimit(req, ORDER_LIMITS.maxBodyBytes);

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

/**
 * IDs de documento Firestore: sin `/`, sin `.`/`..` y acotados. Los IDs
 * autogenerados son de 20 caracteres alfanuméricos; los fixtures usan `_`/`-`.
 */
const ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * GET /getOrder/:orderId?tenantId=...
 *
 * SEC-04: lectura PRIVADA. El pedido contiene datos personales del cliente
 * (nombre, teléfono, dirección), así que exige:
 *   - método GET,
 *   - orderId con formato válido,
 *   - tenant explícito (sin fallback al pilot),
 *   - Firebase ID token + membresía activa con `orders.read_private`.
 * La autorización ocurre ANTES de leer Firestore: un no autorizado nunca
 * distingue un pedido existente de uno inexistente (401/403 antes de 404).
 * No es un endpoint de tracking público; ese contrato queda para otro sprint.
 */
export const getOrder = onRequest(
  { cors: true },
  async (req, res): Promise<void> => {
    try {
      if (req.method !== "GET") {
        res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "GET only" } } satisfies ApiResponse);
        return;
      }

      const orderId = req.path.split("/").filter(Boolean).pop() ?? "";
      if (!ORDER_ID_PATTERN.test(orderId)) {
        throw new ValidationError("A valid order ID is required");
      }

      const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId.trim() : "";
      if (!tenantId) {
        throw new ValidationError("tenantId is required");
      }

      await requireMembershipPermission(req, tenantId, "orders.read_private");

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
