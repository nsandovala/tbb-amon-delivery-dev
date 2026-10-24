import type { Request } from "firebase-functions/v2/https";
import { getAdminAuth } from "./firebase-admin";
import { ForbiddenError, UnauthorizedError } from "./errors";
import { logger } from "./logger";
import { getMembership, tenantExists } from "../repositories/firestore-memberships.repo";
import { roleHasPermission, type Permission } from "./permissions";
import type { MembershipDoc, MembershipRole } from "../schemas/membership.schema";

/**
 * Fachada central de autorización para rutas administrativas.
 *
 * Pipeline por solicitud:
 *   1. Extraer y verificar el Firebase ID token.
 *   2. Obtener el UID autenticado.
 *   3. Resolver el tenant explícito recibido por el route.
 *   4. Consultar `tenants/{tenantId}/members/{uid}` en Firestore.
 *   5. Rechazar si no hay membresía o si `status != active`.
 *   6. Validar el permiso contra la matriz central de roles.
 *   7. Devolver un `AuthorizedActor` para auditoría y lógica downstream.
 *
 * Diseño:
 * - El claim global `admin:true` ya NO concede acceso. La membresía manda.
 * - No se mantiene caché entre solicitudes: la revocación es efectiva en la
 *   próxima request. Dentro de una misma solicitud se memoiza el token y la
 *   lectura de membresía vía `WeakMap<Request, ...>` para evitar re-lecturas
 *   si un handler llama la fachada más de una vez.
 * - Las respuestas son uniformes para "tenant no existe" y "sin membresía":
 *   siempre 403 FORBIDDEN sin filtrar cuál es la causa real.
 */

const tokenCache = new WeakMap<Request, Promise<DecodedUser>>();
const membershipCache = new WeakMap<Request, Map<string, Promise<MembershipDoc | null>>>();
const tenantExistenceCache = new WeakMap<Request, Map<string, Promise<boolean>>>();

interface DecodedUser {
  uid: string;
  email: string | null;
}

export interface AuthorizedActor {
  uid: string;
  email: string | null;
  tenantId: string;
  role: MembershipRole;
}

/**
 * Autenticación + validación de membresía activa sin exigir un permiso
 * específico. Útil para endpoints que informan al cliente su propio contexto
 * (p. ej. `getMyMembership`), nunca para operaciones privadas.
 */
export async function requireActiveMembership(
  req: Request,
  tenantId: string
): Promise<AuthorizedActor> {
  if (!tenantId || typeof tenantId !== "string") {
    throw new ForbiddenError();
  }

  const user = await decodeToken(req);
  const exists = await loadTenantExistence(req, tenantId);
  if (!exists) {
    throw new ForbiddenError();
  }
  const membership = await loadMembership(req, tenantId, user.uid);
  if (!membership || membership.status !== "active") {
    throw new ForbiddenError();
  }
  return { uid: user.uid, email: user.email, tenantId, role: membership.role };
}

async function decodeToken(req: Request): Promise<DecodedUser> {
  const cached = tokenCache.get(req);
  if (cached) return cached;

  const promise = (async (): Promise<DecodedUser> => {
    const header = req.get("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (!match) {
      throw new UnauthorizedError();
    }

    try {
      const decoded = await getAdminAuth().verifyIdToken(match[1]);
      return { uid: decoded.uid, email: decoded.email ?? null };
    } catch (err) {
      logger.warn("Rejected auth token", { error: String(err) });
      throw new UnauthorizedError("Invalid or expired token");
    }
  })();

  tokenCache.set(req, promise);
  return promise;
}

async function loadMembership(
  req: Request,
  tenantId: string,
  uid: string
): Promise<MembershipDoc | null> {
  let perReq = membershipCache.get(req);
  if (!perReq) {
    perReq = new Map();
    membershipCache.set(req, perReq);
  }
  const key = `${tenantId}:${uid}`;
  const cached = perReq.get(key);
  if (cached) return cached;

  const promise = getMembership(tenantId, uid);
  perReq.set(key, promise);
  return promise;
}

async function loadTenantExistence(req: Request, tenantId: string): Promise<boolean> {
  let perReq = tenantExistenceCache.get(req);
  if (!perReq) {
    perReq = new Map();
    tenantExistenceCache.set(req, perReq);
  }
  const cached = perReq.get(tenantId);
  if (cached) return cached;

  const promise = tenantExists(tenantId);
  perReq.set(tenantId, promise);
  return promise;
}

/**
 * Garantiza que el usuario autenticado posee membresía activa en `tenantId`
 * con el `permission` requerido. Lanza 401 si no hay token válido y 403 en
 * cualquier otro caso (tenant inexistente, sin membresía, membresía revocada,
 * permiso insuficiente). No distingue entre esas causas al cliente.
 */
export async function requireMembershipPermission(
  req: Request,
  tenantId: string,
  permission: Permission
): Promise<AuthorizedActor> {
  if (!tenantId || typeof tenantId !== "string") {
    throw new ForbiddenError();
  }

  const user = await decodeToken(req);

  const exists = await loadTenantExistence(req, tenantId);
  if (!exists) {
    logger.warn("Authorization denied: tenant not found", { tenantId, uid: user.uid });
    throw new ForbiddenError();
  }

  const membership = await loadMembership(req, tenantId, user.uid);
  if (!membership || membership.status !== "active") {
    logger.warn("Authorization denied: missing or inactive membership", {
      tenantId,
      uid: user.uid,
    });
    throw new ForbiddenError();
  }

  if (!roleHasPermission(membership.role, permission)) {
    logger.warn("Authorization denied: permission not granted by role", {
      tenantId,
      uid: user.uid,
      role: membership.role,
      permission,
    });
    throw new ForbiddenError();
  }

  return {
    uid: user.uid,
    email: user.email,
    tenantId,
    role: membership.role,
  };
}
