"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTenantContext } from "@/components/tenant-provider";
import { TenantSelector } from "@/components/tenant-selector";
import { tearDownAuthorizedSession } from "@/lib/auth/handle-authz-loss";

export function AdminGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status, activeTenant, memberships, errorMessage, refresh } = useTenantContext();

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

  // P2: fallo transitorio (red/5xx). NO redirigir a /login — rompería un
  // loop si el servidor vuelve rápido. Mostramos retry y mantenemos sesión.
  if (status === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-lg font-semibold">No pudimos cargar tus empresas</h1>
        <p className="max-w-md text-sm text-neutral-500">
          {errorMessage ?? "Error temporal al consultar membresías."}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-black"
          >
            Reintentar
          </button>
          <button
            type="button"
            onClick={() => void tearDownAuthorizedSession()}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-neutral-300"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
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

  // P1-2: usar `tenantId` como key fuerza a React a remontar la rama entera
  // cuando el usuario cambia de empresa. Carrito, listeners, formularios y
  // estado interno de todas las páginas admin reinician — no hay forma de que
  // datos cargados del tenant A terminen en una escritura al tenant B.
  return <div key={activeTenant.tenantId}>{children}</div>;
}
