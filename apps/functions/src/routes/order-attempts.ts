import { onRequest } from "firebase-functions/v2/https";
import { z } from "zod";
import { requireMembershipPermission } from "../lib/authz";
import { AppError, ValidationError } from "../lib/errors";
import { deriveIdempotentOrderId, idempotencyKeySchema } from "../lib/idempotency";
import { logger } from "../lib/logger";
import { assertBodyWithinLimit } from "../lib/request-limits";
import { lookupOrderAttempt as findAttempt } from "../repositories/firestore-orders.repo";
import { DOCUMENT_ID_PATTERN } from "../schemas/order-limits";
import type { ApiResponse } from "../types/api";

const lookupSchema = z.object({
  tenantId: z.string().min(1).max(128).regex(DOCUMENT_ID_PATTERN),
  channel: z.enum(["web", "admin_pos"]),
  idempotencyKey: idempotencyKeySchema,
});

/**
 * POST /lookupOrderAttempt
 * Body: { tenantId, channel: "web" | "admin_pos", idempotencyKey }
 *
 * ORDER-IDEMPOTENCY (O-01): permite recuperar el resultado de un intento cuya
 * respuesta se perdió (p. ej. tras recargar la página) SIN crear ni modificar
 * nada. Responde 200 con `found: true` + identificadores del pedido, o
 * `found: false`. Nunca devuelve datos del cliente ni del carrito.
 *
 * - Canal web: público. La clave aleatoria del intento es el secreto; sin
 *   ella no se puede derivar el pedido.
 * - Canal POS: exige membresía activa con `pos.create_sale` en el tenant.
 * - Tenant explícito, sin fallback. Costo: 1 lectura (+ autorización en POS).
 */
export const lookupOrderAttempt = onRequest(
  { cors: true },
  async (req, res): Promise<void> => {
    try {
      if (req.method !== "POST") {
        res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "POST only" } } satisfies ApiResponse);
        return;
      }
      assertBodyWithinLimit(req, 2 * 1024);

      const parsed = lookupSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new ValidationError("Invalid lookup payload", parsed.error.issues);
      }
      const { tenantId, channel, idempotencyKey } = parsed.data;

      if (channel === "admin_pos") {
        await requireMembershipPermission(req, tenantId, "pos.create_sale");
      }

      const attempt = await findAttempt(
        tenantId,
        deriveIdempotentOrderId(tenantId, channel, idempotencyKey)
      );

      res.status(200).json({
        ok: true,
        data: attempt ? { found: true, ...attempt } : { found: false },
      } satisfies ApiResponse);
    } catch (err) {
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
      logger.error("Unhandled error in lookupOrderAttempt", { error: String(err) });
      res.status(500).json({ ok: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
    }
  }
);
