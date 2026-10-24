import { z } from "zod";

/**
 * Membresía por tenant: `tenants/{tenantId}/members/{uid}`.
 *
 * El claim global `admin:true` ya no concede acceso: la autorización lee este
 * documento en cada solicitud. La escritura queda bloqueada desde cliente
 * (bootstrap vía Admin SDK). Ver `lib/authz.ts` y `firestore.rules`.
 *
 * SEC-02 añadirá más roles e invitaciones. Mantener la lista cerrada evita
 * aceptar roles arbitrarios por error.
 */

export const MEMBERSHIP_ROLES = ["owner", "admin"] as const;
export const MEMBERSHIP_STATUSES = ["active", "revoked"] as const;

export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const membershipRoleSchema = z.enum(MEMBERSHIP_ROLES);
export const membershipStatusSchema = z.enum(MEMBERSHIP_STATUSES);

/**
 * Documento tal como vive en Firestore. `createdAt`/`updatedAt`/`revokedAt`
 * se persisten como `Timestamp` pero se tipan `unknown` acá para no acoplar
 * esta capa a `firebase-admin`.
 */
export const membershipDocSchema = z.object({
  uid: z.string().min(1),
  tenantId: z.string().min(1),
  role: membershipRoleSchema,
  status: membershipStatusSchema,
  createdAt: z.unknown(),
  createdByUid: z.string().min(1),
  updatedAt: z.unknown().optional(),
  revokedAt: z.unknown().optional(),
  revokedByUid: z.string().min(1).optional(),
});

export type MembershipDoc = z.infer<typeof membershipDocSchema>;
