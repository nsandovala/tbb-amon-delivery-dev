import { getDb } from "../lib/firebase-admin";
import { membershipDocSchema, type MembershipDoc } from "../schemas/membership.schema";

/**
 * Repositorio de membresías. Cada llamada hace una lectura puntual a Firestore
 * (sin caché cross-request): la revocación debe ser efectiva en la siguiente
 * solicitud. La memoización por-solicitud se maneja en `lib/authz.ts`.
 */

export async function getMembership(
  tenantId: string,
  uid: string
): Promise<MembershipDoc | null> {
  const snap = await getDb()
    .collection("tenants")
    .doc(tenantId)
    .collection("members")
    .doc(uid)
    .get();

  if (!snap.exists) return null;

  const parsed = membershipDocSchema.safeParse({ ...snap.data(), uid, tenantId });
  if (!parsed.success) {
    throw new Error(
      `Membership document is malformed for tenants/${tenantId}/members/${uid}`
    );
  }
  return parsed.data;
}

/**
 * Verifica que el documento `tenants/{tenantId}` exista. No expone contenido
 * del tenant; solo se usa para rechazar solicitudes a tenants inexistentes
 * sin filtrar que la causa es "no existe el tenant" vs "no tienes acceso".
 */
export async function tenantExists(tenantId: string): Promise<boolean> {
  const snap = await getDb().collection("tenants").doc(tenantId).get();
  return snap.exists;
}

export interface TenantSummary {
  tenantId: string;
  name: string | null;
}

/**
 * Lee todas las membresías activas del uid. Usa collectionGroup; depende del
 * índice declarado en `firestore.indexes.json`. Para cada tenant devuelve
 * el nombre público si existe (una lectura extra por tenant). Para 1–2
 * tenants por usuario esto es despreciable.
 */
export async function listActiveMembershipsForUid(uid: string): Promise<
  Array<{ membership: MembershipDoc; tenant: TenantSummary }>
> {
  const snaps = await getDb()
    .collectionGroup("members")
    .where("uid", "==", uid)
    .where("status", "==", "active")
    .get();

  if (snaps.empty) return [];

  const results: Array<{ membership: MembershipDoc; tenant: TenantSummary }> = [];
  for (const snap of snaps.docs) {
    const data = snap.data();
    const inferredTenantId =
      typeof data.tenantId === "string" && data.tenantId
        ? data.tenantId
        : snap.ref.parent.parent?.id ?? "";
    if (!inferredTenantId) continue;

    const parsed = membershipDocSchema.safeParse({
      ...data,
      uid,
      tenantId: inferredTenantId,
    });
    if (!parsed.success) continue;

    const tenantSnap = await getDb().collection("tenants").doc(inferredTenantId).get();
    const tenantData = tenantSnap.data();
    const name = typeof tenantData?.name === "string" ? tenantData.name : null;
    results.push({
      membership: parsed.data,
      tenant: { tenantId: inferredTenantId, name },
    });
  }
  return results;
}
