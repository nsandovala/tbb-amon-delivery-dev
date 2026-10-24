import type { MembershipRole } from "../schemas/membership.schema";

/**
 * Matriz central de permisos por rol de membresía.
 *
 * El owner recibe todos los permisos del tenant, incluyendo administración de
 * miembros (reservado para SEC-02). El admin recibe únicamente los permisos
 * operacionales explícitamente habilitados — sin bypass por claim legacy.
 *
 * Cambios a esta matriz afectan a todos los endpoints protegidos por
 * `requireMembershipPermission`. Revisar `authz.ts` y las rutas en
 * `routes/expenses.ts` y `routes/store.ts` antes de editar.
 */

export const PERMISSIONS = [
  "expenses.create",
  "store.read_control",
  "store.manage_operation",
  "store.manage_hours",
  "cash.read_summary",
  "cash.close_session",
  "orders.update_status",
  "pos.create_sale",
  "members.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const OPERATIONAL_PERMISSIONS: Permission[] = [
  "expenses.create",
  "store.read_control",
  "store.manage_operation",
  "store.manage_hours",
  "cash.read_summary",
  "cash.close_session",
  "orders.update_status",
  "pos.create_sale",
];

const ROLE_PERMISSIONS: Record<MembershipRole, ReadonlySet<Permission>> = {
  owner: new Set<Permission>([...OPERATIONAL_PERMISSIONS, "members.manage"]),
  admin: new Set<Permission>(OPERATIONAL_PERMISSIONS),
};

export function rolePermissions(role: MembershipRole): ReadonlySet<Permission> {
  return ROLE_PERMISSIONS[role];
}

export function roleHasPermission(role: MembershipRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
