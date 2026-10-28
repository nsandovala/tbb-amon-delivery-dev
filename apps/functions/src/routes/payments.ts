import { onRequest, type Request } from "firebase-functions/v2/https";
import { requireMembershipPermission } from "../lib/authz";
import { AppError, ValidationError } from "../lib/errors";
import { logger } from "../lib/logger";
import { assertBodyWithinLimit } from "../lib/request-limits";
import {
  confirmTransferPayment as registerConfirmation,
  listPaymentEvents as loadPaymentEvents,
  revertTransferConfirmation as registerReversal,
} from "../repositories/firestore-payments.repo";
import {
  PAYMENT_BODY_MAX_BYTES,
  confirmTransferPaymentSchema,
  listPaymentEventsQuerySchema,
  revertTransferConfirmationSchema,
} from "../schemas/payment-confirmation.schema";
import type { ApiResponse } from "../types/api";

/**
 * FIN-01 — confirmación individual y auditable de transferencias.
 * Contrato: docs/architecture/payment-confirmation-contract.md
 *
 * Todas las rutas exigen tenant explícito y membresía activa con permiso
 * `payments.*`. La autorización ocurre antes de leer Firestore: un no
 * autorizado no distingue un pedido existente de uno inexistente.
 */

type Res = { status: (code: number) => { json: (body: ApiResponse) => void } };

function readTenant(req: Request): string {
  const fromQuery = typeof req.query.tenantId === "string" ? req.query.tenantId.trim() : "";
  const fromBody =
    req.body && typeof req.body.tenantId === "string" ? req.body.tenantId.trim() : "";
  const tenantId = fromQuery || fromBody;
  if (!tenantId) throw new ValidationError("tenantId is required");
  return tenantId;
}

function methodNotAllowed(res: Res, allowed: string): void {
  res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: `${allowed} only` } });
}

/**
 * POST /confirmTransferPayment
 * Body: { tenantId, orderId, expectedAmount, reference?, idempotencyKey }
 * 201 al confirmar; 200 + replayed:true al reproducir la misma clave.
 */
export const confirmTransferPayment = onRequest(
  { cors: true },
  async (req, res): Promise<void> => {
    try {
      if (req.method !== "POST") return methodNotAllowed(res, "POST");
      assertBodyWithinLimit(req, PAYMENT_BODY_MAX_BYTES);
      const tenantId = readTenant(req);
      const actor = await requireMembershipPermission(req, tenantId, "payments.confirm_transfer");
      const parsed = confirmTransferPaymentSchema.safeParse({ ...(req.body ?? {}), tenantId });
      if (!parsed.success) {
        throw new ValidationError("Invalid transfer confirmation payload", parsed.error.issues);
      }
      const data = await registerConfirmation(actor, parsed.data);
      res.status(data.replayed ? 200 : 201).json({ ok: true, data } satisfies ApiResponse);
    } catch (err) {
      handleError(err, res);
    }
  }
);

/**
 * POST /revertTransferConfirmation
 * Body: { tenantId, orderId, expectedConfirmationEventId, reason, idempotencyKey }
 * Corrección contable (el abono no existe o no corresponde). NO es un reembolso.
 */
export const revertTransferConfirmation = onRequest(
  { cors: true },
  async (req, res): Promise<void> => {
    try {
      if (req.method !== "POST") return methodNotAllowed(res, "POST");
      assertBodyWithinLimit(req, PAYMENT_BODY_MAX_BYTES);
      const tenantId = readTenant(req);
      const actor = await requireMembershipPermission(req, tenantId, "payments.confirm_transfer");
      const parsed = revertTransferConfirmationSchema.safeParse({ ...(req.body ?? {}), tenantId });
      if (!parsed.success) {
        throw new ValidationError("Invalid transfer reversal payload", parsed.error.issues);
      }
      const data = await registerReversal(actor, parsed.data);
      res.status(data.replayed ? 200 : 201).json({ ok: true, data } satisfies ApiResponse);
    } catch (err) {
      handleError(err, res);
    }
  }
);

/**
 * GET /listPaymentEvents?tenantId=...&orderId=... | &operationalDate=YYYY-MM-DD
 * Lectura del libro con actor y motivo; exige `payments.view`.
 */
export const listPaymentEvents = onRequest(
  { cors: true },
  async (req, res): Promise<void> => {
    try {
      if (req.method !== "GET") return methodNotAllowed(res, "GET");
      const tenantId = readTenant(req);
      await requireMembershipPermission(req, tenantId, "payments.view");
      const parsed = listPaymentEventsQuerySchema.safeParse({
        tenantId,
        orderId: typeof req.query.orderId === "string" && req.query.orderId ? req.query.orderId : undefined,
        operationalDate:
          typeof req.query.operationalDate === "string" && req.query.operationalDate
            ? req.query.operationalDate
            : undefined,
      });
      if (!parsed.success) {
        throw new ValidationError("Invalid payment events query", parsed.error.issues);
      }
      const data = await loadPaymentEvents(parsed.data);
      res.status(200).json({ ok: true, data } satisfies ApiResponse);
    } catch (err) {
      handleError(err, res);
    }
  }
);

function handleError(err: unknown, res: Res): void {
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
