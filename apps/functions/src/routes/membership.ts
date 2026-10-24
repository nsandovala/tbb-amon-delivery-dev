import { onRequest, type Request } from "firebase-functions/v2/https";
import { getAdminAuth } from "../lib/firebase-admin";
import { listActiveMembershipsForUid } from "../repositories/firestore-memberships.repo";
import { requireActiveMembership } from "../lib/authz";
import { rolePermissions } from "../lib/permissions";
import { UnauthorizedError, ValidationError, AppError } from "../lib/errors";
import { logger } from "../lib/logger";
import type { ApiResponse } from "../types/api";

type Res = { status: (code: number) => { json: (body: ApiResponse) => void } };

function readTenant(req: Request): string {
  const fromQuery = typeof req.query.tenantId === "string" ? req.query.tenantId.trim() : "";
  return fromQuery;
}

/**
 * GET /getMyMembership?tenantId=<id>
 * Devuelve el rol y permisos resueltos del usuario autenticado en el tenant
 * indicado. Reemplaza al chequeo cliente de `token.claims.admin`.
 */
export const getMyMembership = onRequest(
  { cors: true },
  async (req, res): Promise<void> => {
    try {
      if (req.method !== "GET") {
        res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "GET only" } } satisfies ApiResponse);
        return;
      }
      const tenantId = readTenant(req);
      if (!tenantId) {
        throw new ValidationError("tenantId is required");
      }

      const actor = await requireActiveMembership(req, tenantId);
      const permissions = Array.from(rolePermissions(actor.role));

      res.status(200).json({
        ok: true,
        data: {
          uid: actor.uid,
          tenantId: actor.tenantId,
          role: actor.role,
          permissions,
        },
      } satisfies ApiResponse);
    } catch (err) {
      handleError(err, res);
    }
  }
);

/**
 * GET /listMyMemberships
 * Devuelve todas las membresías activas del usuario autenticado. Habilita el
 * selector multi-tenant en el admin: el frontend NO decide el tenant por un
 * ID arbitrario — el servidor devuelve la lista autorizada y el cliente elige
 * entre ella.
 */
export const listMyMemberships = onRequest(
  { cors: true },
  async (req, res): Promise<void> => {
    try {
      if (req.method !== "GET") {
        res.status(405).json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "GET only" } } satisfies ApiResponse);
        return;
      }

      const header = req.get("authorization") ?? "";
      const match = /^Bearer\s+(.+)$/i.exec(header.trim());
      if (!match) {
        throw new UnauthorizedError();
      }
      let uid: string;
      let email: string | null;
      try {
        const decoded = await getAdminAuth().verifyIdToken(match[1]);
        uid = decoded.uid;
        email = decoded.email ?? null;
      } catch (err) {
        logger.warn("Rejected auth token in listMyMemberships", { error: String(err) });
        throw new UnauthorizedError("Invalid or expired token");
      }

      const memberships = await listActiveMembershipsForUid(uid);
      const payload = memberships.map(({ membership, tenant }) => ({
        tenantId: tenant.tenantId,
        tenantName: tenant.name,
        role: membership.role,
        permissions: Array.from(rolePermissions(membership.role)),
      }));

      res.status(200).json({
        ok: true,
        data: { uid, email, memberships: payload },
      } satisfies ApiResponse);
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
