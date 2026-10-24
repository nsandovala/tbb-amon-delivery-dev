"use client";

import { useTenantContext } from "@/components/tenant-provider";
import { tearDownAuthorizedSession } from "@/lib/auth/handle-authz-loss";
import type { MembershipSummary } from "@/lib/api/membership";

/**
 * UI mínima para que un usuario con múltiples membresías elija el tenant
 * activo. La lista proviene siempre del servidor (`listMyMemberships`); el
 * cliente nunca inyecta un ID arbitrario. Si una selección no está en la
 * lista, `setActiveTenant` lanza.
 */
export function TenantSelector({ memberships }: { memberships: MembershipSummary[] }) {
  const { setActiveTenant } = useTenantContext();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#0B0B0B] p-6">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0D0D0D]/92 p-8">
        <h1 className="text-xl font-semibold text-white">Elige la empresa</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Tienes acceso a varias empresas. Selecciona la que quieres operar.
        </p>
        <ul className="mt-6 space-y-3">
          {memberships.map((m) => (
            <li key={m.tenantId}>
              <button
                type="button"
                onClick={() => setActiveTenant(m.tenantId)}
                className="flex w-full flex-col items-start rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition hover:border-emerald-400/40"
              >
                <span className="text-sm font-semibold text-white">
                  {m.tenantName ?? m.tenantId}
                </span>
                <span className="text-xs uppercase tracking-widest text-emerald-400/80">
                  {m.role}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => void tearDownAuthorizedSession()}
          className="mt-6 w-full rounded-xl border border-white/10 px-4 py-2 text-xs uppercase tracking-widest text-neutral-400"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
