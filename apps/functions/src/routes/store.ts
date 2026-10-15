import { onRequest, type Request } from "firebase-functions/v2/https";
import { requireAdmin } from "../lib/admin-auth";
import { ValidationError, AppError } from "../lib/errors";
import { logger } from "../lib/logger";
import {
  getPublicStoreStatus,
  getStoreControl as loadStoreControl,
  setStoreOperation as applyStoreOperation,
  storeOperationInputSchema,
  updateStoreHours as saveStoreHours,
  updateStoreHoursInputSchema,
} from "../services/store-operation.service";
import {
  closeCashSession as registerCashClose,
  closeCashSessionInputSchema,
  getCashCloseSummary as loadCashCloseSummary,
} from "../services/cash-close.service";
import type { ApiResponse } from "../types/api";

const DEFAULT_TENANT = "tbb";

type Res = { status: (code: number) => { json: (body: ApiResponse) => void } };

function resolveTenant(req: Request): string {
  const fromQuery = typeof req.query.tenantId === "string" ? req.query.tenantId.trim() : "";
  const fromBody =
    req.body && typeof req.body.tenantId === "string" ? req.body.tenantId.trim() : "";
  return fromQuery || fromBody || DEFAULT_TENANT;
}

function methodNotAllowed(res: Res, allowed: string): void {
  res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: `${allowed} only` } });
}

/**
 * GET /getStoreStatus?tenantId=tbb
 * Public, safe status for storefront/POS/kitchen screens (no actor, no reasons).
 */
export const getStoreStatus = onRequest(
  { cors: true },
  async (req, res): Promise<void> => {
    try {
      if (req.method !== "GET") return methodNotAllowed(res, "GET");
      const data = await getPublicStoreStatus(resolveTenant(req));
      res.status(200).json({ ok: true, data } satisfies ApiResponse);
    } catch (err) {
      handleError(err, res);
    }
  }
);

/**
 * GET /getStoreControl?tenantId=tbb  (admin)
 * Full status, schedule config and recent audit events for the control room.
 */
export const getStoreControl = onRequest(
  { cors: true },
  async (req, res): Promise<void> => {
    try {
      if (req.method !== "GET") return methodNotAllowed(res, "GET");
      await requireAdmin(req);
      const data = await loadStoreControl(resolveTenant(req));
      res.status(200).json({ ok: true, data } satisfies ApiResponse);
    } catch (err) {
      handleError(err, res);
    }
  }
);

/**
 * POST /setStoreOperation  (admin)
 * Body: { action: "open" | "close" | "resume_schedule", reason?: string }
 */
export const setStoreOperation = onRequest(
  { cors: true },
  async (req, res): Promise<void> => {
    try {
      if (req.method !== "POST") return methodNotAllowed(res, "POST");
      const actor = await requireAdmin(req);
      const parsed = storeOperationInputSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new ValidationError("Invalid store operation payload", parsed.error.issues);
      }
      const data = await applyStoreOperation(resolveTenant(req), actor, parsed.data);
      res.status(200).json({ ok: true, data } satisfies ApiResponse);
    } catch (err) {
      handleError(err, res);
    }
  }
);

/**
 * POST /updateStoreHours  (admin)
 * Body: { config: StoreHoursConfig, reason?: string }
 */
export const updateStoreHours = onRequest(
  { cors: true },
  async (req, res): Promise<void> => {
    try {
      if (req.method !== "POST" && req.method !== "PUT") return methodNotAllowed(res, "POST/PUT");
      const actor = await requireAdmin(req);
      const parsed = updateStoreHoursInputSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new ValidationError("Invalid store hours payload", parsed.error.issues);
      }
      const data = await saveStoreHours(
        resolveTenant(req),
        actor,
        parsed.data.config,
        parsed.data.reason
      );
      res.status(200).json({ ok: true, data } satisfies ApiResponse);
    } catch (err) {
      handleError(err, res);
    }
  }
);

/**
 * GET /getCashCloseSummary?tenantId=tbb&operationalDate=YYYY-MM-DD  (admin)
 */
export const getCashCloseSummary = onRequest(
  { cors: true },
  async (req, res): Promise<void> => {
    try {
      if (req.method !== "GET") return methodNotAllowed(res, "GET");
      await requireAdmin(req);
      const requested =
        typeof req.query.operationalDate === "string" && req.query.operationalDate
          ? req.query.operationalDate
          : undefined;
      const data = await loadCashCloseSummary(resolveTenant(req), requested);
      res.status(200).json({ ok: true, data } satisfies ApiResponse);
    } catch (err) {
      handleError(err, res);
    }
  }
);

/**
 * POST /closeCashSession  (admin)
 * Body: { countedCash, transfersConfirmed, idempotencyKey, operationalDate?, observation?, override?: { reason } }
 * 201 on first close, 200 when replaying the same idempotencyKey.
 */
export const closeCashSession = onRequest(
  { cors: true },
  async (req, res): Promise<void> => {
    try {
      if (req.method !== "POST") return methodNotAllowed(res, "POST");
      const actor = await requireAdmin(req);
      const parsed = closeCashSessionInputSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new ValidationError("Invalid cash close payload", parsed.error.issues);
      }
      const data = await registerCashClose(resolveTenant(req), actor, parsed.data);
      res.status(data.replayed ? 200 : 201).json({ ok: true, data } satisfies ApiResponse);
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
