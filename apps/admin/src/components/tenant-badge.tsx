"use client";

import { useTenantContext } from "@/components/tenant-provider";
import { tearDownAuthorizedSession } from "@/lib/auth/handle-authz-loss";

/**
 * Pastilla compacta que muestra empresa + rol + usuario y permite cambiar
 * tenant (si hay varias) o cerrar sesión. Para incluir en el header de las
 * páginas admin.
 */
export function TenantBadge() {
  const { activeTenant, memberships, email, setActiveTenant } = useTenantContext();
  if (!activeTenant) return null;

  const otherMemberships = memberships.filter((m) => m.tenantId !== activeTenant.tenantId);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs">
      <div className="flex flex-col">
        <span className="font-semibold text-white">
          {activeTenant.tenantName ?? activeTenant.tenantId}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-emerald-400/80">
          {activeTenant.role} · {email ?? "sin email"}
        </span>
      </div>
      {otherMemberships.length > 0 && (
        <select
          value={activeTenant.tenantId}
          onChange={(e) => setActiveTenant(e.target.value)}
          className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-white"
          aria-label="Cambiar tenant activo"
        >
          {memberships.map((m) => (
            <option key={m.tenantId} value={m.tenantId}>
              {m.tenantName ?? m.tenantId}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        onClick={() => void tearDownAuthorizedSession()}
        className="rounded-lg border border-white/10 px-2 py-1 uppercase tracking-widest text-neutral-400"
      >
        Salir
      </button>
    </div>
  );
}
