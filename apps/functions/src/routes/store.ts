import { onRequest, type Request } from "firebase-functions/v2/https";
import { requireMembershipPermission } from "../lib/authz";
import { ValidationError, AppError } from "../lib/errors";
import { logger } from "../lib/logger";
import {
  getPublicStoreStatus,
  getStoreControl as loadStoreControl,
  deleteStoreDateException as removeStoreDateException,
  deleteStoreDateExceptionInputSchema,
  setStoreOperation as applyStoreOperation,
  storeOperationInputSchema,
  updateStoreDateException as saveStoreDateException,
  updateStoreDateExceptionInputSchema,
  updateStoreHours as saveStoreHours,
  updateStoreHoursInputSchema,
} from "../services/store-operation.service";
import {
  closeCashSession as registerCashClose,
  closeCashSessionInputSchema,
  getCashCloseSummary as loadCashCloseSummary,
} from "../services/cash-close.service";
import type { ApiResponse } from "../types/api";

/**
 * Fallback público solo para `getStoreStatus`, que lo consulta el storefront
 * sin sesión. Las rutas administrativas usan `resolvePrivateTenant` y nunca
 * caen a este valor.
 */
const PUBLIC_FALLBACK_TENANT = "tbb";

type Res = { status: (code: number) => { json: (body: ApiResponse) => void } };

function readTenant(req: Request): string {
  const fromQuery = typeof req.query.tenantId === "string" ? req.query.tenantId.trim() : "";
  const fromBody =
    req.body && typeof req.body.tenantId === "string" ? req.body.tenantId.trim() : "";
  return fromQuery || fromBody || "";
}

function resolvePublicTenant(req: Request): string {
  return readTenant(req) || PUBLIC_FALLBACK_TENANT;
}

/**
 * Resuelve el tenantId exigido por operaciones privadas. Lanza 400 si no se
 * recibe explícitamente: SEC-BASE elimina los fallbacks silenciosos entre
 * tenants.
 */
function resolvePrivateTenant(req: Request): string {
  const tenantId = readTenant(req);
  if (!tenantId) {
    throw new ValidationError("tenantId is required");
  }
  return tenantId;
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
      const data = await getPublicStoreStatus(resolvePublicTenant(req));
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
      const tenantId = resolvePrivateTenant(req);
      await requireMembershipPermission(req, tenantId, "store.read_control");
      const data = await loadStoreControl(tenantId);
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
      const tenantId = resolvePrivateTenant(req);
      const actor = await requireMembershipPermission(req, tenantId, "store.manage_operation");
      const parsed = storeOperationInputSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new ValidationError("Invalid store operation payload", parsed.error.issues);
      }
      const data = await applyStoreOperation(tenantId, actor, parsed.data);
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
      const tenantId = resolvePrivateTenant(req);
      const actor = await requireMembershipPermission(req, tenantId, "store.manage_hours");
      const parsed = updateStoreHoursInputSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new ValidationError("Invalid store hours payload", parsed.error.issues);
      }
      const data = await saveStoreHours(
        tenantId,
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
 * POST /updateStoreDateException (admin)
 * Body: { exception: { date, mode, open?, close?, customerMessage? }, reason? }
 */
export const updateStoreDateException = onRequest(
  { cors: true },
  async (req, res): Promise<void> => {
    try {
      if (req.method !== "POST" && req.method !== "PUT") return methodNotAllowed(res, "POST/PUT");
      const tenantId = resolvePrivateTenant(req);
      const actor = await requireMembershipPermission(req, tenantId, "store.manage_hours");
      const parsed = updateStoreDateExceptionInputSchema.safeParse(req.body ?? {});
      if (!parsed.success) throw new ValidationError("Invalid special date payload", parsed.error.issues);
      const data = await saveStoreDateException(
        tenantId, actor, parsed.data.exception, parsed.data.reason
      );
      res.status(200).json({ ok: true, data } satisfies ApiResponse);
    } catch (err) {
      handleError(err, res);
    }
  }
);

/**
 * POST /deleteStoreDateException (admin)
 * Body: { date: "YYYY-MM-DD", reason? }
 */
export const deleteStoreDateException = onRequest(
  { cors: true },
  async (req, res): Promise<void> => {
    try {
      if (req.method !== "POST") return methodNotAllowed(res, "POST");
      const tenantId = resolvePrivateTenant(req);
      const actor = await requireMembershipPermission(req, tenantId, "store.manage_hours");
      const parsed = deleteStoreDateExceptionInputSchema.safeParse(req.body ?? {});
      if (!parsed.success) throw new ValidationError("Invalid special date payload", parsed.error.issues);
      const data = await removeStoreDateException(
        tenantId, actor, parsed.data.date, parsed.data.reason
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
      const tenantId = resolvePrivateTenant(req);
      await requireMembershipPermission(req, tenantId, "cash.read_summary");
      const requested =
        typeof req.query.operationalDate === "string" && req.query.operationalDate
          ? req.query.operationalDate
          : undefined;
      const data = await loadCashCloseSummary(tenantId, requested);
      res.status(200).json({ ok: true, data } satisfies ApiResponse);
    } catch (err) {
      handleError(err, res);
    }
  }
);

/**
 * POST /closeCashSession  (admin)
 * Body: { countedCash, transfersConfirmed, idempotencyKey, operationalDate?, observation?, override?: { reason },
 *        discrepancy?: { reason, acknowledged: true, cashDifference, collectionDifference },
 *        transfersEntryMode?: "manual" | "ledger_suggestion", ledgerSuggestion?: { suggestedAmount, bankVerified: true } }
 * 422 CASH_DIFFERENCE_REASON_REQUIRED / 409 CASH_CLOSE_DIFFERENCE_STALE / 409 CASH_CLOSE_LEDGER_SUGGESTION_STALE
 * devuelven las cifras recalculadas por el servidor (FIN-CLOSE-01).
 * 201 on first close, 200 when replaying the same idempotencyKey.
 */
export const closeCashSession = onRequest(
  { cors: true },
  async (req, res): Promise<void> => {
    try {
      if (req.method !== "POST") return methodNotAllowed(res, "POST");
      const tenantId = resolvePrivateTenant(req);
      const actor = await requireMembershipPermission(req, tenantId, "cash.close_session");
      const parsed = closeCashSessionInputSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new ValidationError("Invalid cash close payload", parsed.error.issues);
      }
      const data = await registerCashClose(tenantId, actor, parsed.data);
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
