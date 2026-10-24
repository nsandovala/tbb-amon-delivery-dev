"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTenantContext } from "@/components/tenant-provider";
import { TenantSelector } from "@/components/tenant-selector";
import { tearDownAuthorizedSession } from "@/lib/auth/handle-authz-loss";

export function AdminGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status, activeTenant, memberships } = useTenantContext();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-neutral-500">Verificando acceso…</p>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  if (status === "no-memberships") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">No tienes acceso a ninguna empresa</h1>
        <p className="max-w-md text-sm text-neutral-500">
          Un owner del tenant debe otorgarte membresía antes de ingresar al panel.
        </p>
        <button
          type="button"
          onClick={() => void tearDownAuthorizedSession()}
          className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-black"
        >
          Cerrar sesión
        </button>
      </div>
    );
  }

  if (!activeTenant) {
    return <TenantSelector memberships={memberships} />;
  }

  return <>{children}</>;
}
