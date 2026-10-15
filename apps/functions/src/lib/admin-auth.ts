import type { Request } from "firebase-functions/v2/https";
import { getAdminAuth } from "./firebase-admin";
import { ForbiddenError, UnauthorizedError } from "./errors";
import { logger } from "./logger";
import type { StoreActor } from "./store-hours";

/**
 * Verifies `Authorization: Bearer <Firebase ID token>` and requires the
 * `admin: true` custom claim — the same claim Firestore rules use (`isAdmin()`).
 * Returns the actor recorded in audit events.
 */
export async function requireAdmin(req: Request): Promise<StoreActor> {
  const header = req.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    throw new UnauthorizedError();
  }

  let decoded: { uid: string; email?: string; admin?: unknown };
  try {
    decoded = await getAdminAuth().verifyIdToken(match[1]);
  } catch (err) {
    logger.warn("Rejected admin token", { error: String(err) });
    throw new UnauthorizedError("Invalid or expired admin token");
  }

  if (decoded.admin !== true) {
    throw new ForbiddenError();
  }

  return { uid: decoded.uid, email: decoded.email ?? null };
}
