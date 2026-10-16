"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { AuditLog } from "@/components/operation/audit-log";
import { CashPanel } from "@/components/operation/cash-panel";
import { ScheduleEditor } from "@/components/operation/schedule-editor";
import { StorePanel } from "@/components/operation/store-panel";
import { usePolledStoreStatus } from "@/hooks/use-store-status";
import { fetchStoreControl, STORE_TENANT_ID } from "@/lib/api/store";
import { auth, db } from "@/lib/firebase/client";
import { formatOperationalDate } from "@/lib/store-status";

type TenantIdentity = {
  name?: string;
  location?: { commune?: string; city?: string };
};

export default function OperacionPage() {
  const { data: control, error, nowMs, refresh } = usePolledStoreStatus(fetchStoreControl);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [operatorEmail, setOperatorEmail] = useState<string | null>(null);
  const [tenant, setTenant] = useState<TenantIdentity | null>(null);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("amon-operations-theme");
    if (storedTheme === "light" || storedTheme === "dark") setTheme(storedTheme);

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => setOperatorEmail(user?.email ?? null));
    let active = true;
    void getDoc(doc(db, "tenants", STORE_TENANT_ID)).then((snapshot) => {
      if (active && snapshot.exists()) setTenant(snapshot.data() as TenantIdentity);
    }).catch(() => {
      // La operación sigue disponible si falla la lectura pública del nombre del tenant.
    });

    return () => {
      active = false;
      unsubscribeAuth();
    };
  }, []);

  function toggleTheme() {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      window.localStorage.setItem("amon-operations-theme", next);
      return next;
    });
  }

  const location = [tenant?.location?.commune, tenant?.location?.city].filter(Boolean).join(" · ");

  return (
    <main
      data-admin-surface="operations"
      data-theme={theme}
      className="min-h-screen bg-[#050505] text-white"
    >
      <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 sm:py-7">
        <section className="ops-surface mb-5 grid grid-cols-1 border border-white/10 bg-[#101010] sm:grid-cols-[1.1fr_1.2fr_1fr]" aria-label="Contexto de operación">
          <div className="px-4 py-3">
            <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Negocio / tenant</span>
            <strong className="ops-text mt-1 block truncate text-xs font-semibold text-white">{tenant?.name ?? "Cargando tienda…"}</strong>
            <small className="ops-muted mt-0.5 block text-[10px] text-neutral-400">Tenant {STORE_TENANT_ID.toUpperCase()}</small>
          </div>
          <div className="border-t border-white/10 px-4 py-3 sm:border-l sm:border-t-0">
            <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Local activo</span>
            <strong className="ops-text mt-1 block truncate text-xs font-semibold text-white">{tenant?.location?.commune ?? "Local no disponible"}</strong>
            <small className="ops-muted mt-0.5 block text-[10px] text-neutral-400">{tenant?.location?.city ?? "Ubicación no configurada"}</small>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3 sm:border-l sm:border-t-0">
            <div className="min-w-0">
              <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Operador actual</span>
              <strong className="ops-text mt-1 block truncate text-xs font-semibold text-white">{operatorEmail ?? "Sesión no disponible"}</strong>
              <small className="ops-muted mt-0.5 block text-[10px] text-neutral-400">Acceso verificado · Administrador</small>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={`Cambiar a modo ${theme === "dark" ? "claro" : "oscuro"}`}
              className="ops-text shrink-0 rounded-sm border border-white/10 px-2.5 py-1.5 text-[10px] font-medium text-white hover:bg-white/5"
            >
              Modo {theme === "dark" ? "claro" : "oscuro"}
            </button>
          </div>
        </section>

        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">Sala de control</p>
            <h1 className="ops-text mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">Operación</h1>
            <p className="ops-muted mt-1 text-xs text-neutral-400">Jornada, calendario y cierre de caja en una sola vista.</p>
          </div>
          <div className="text-right text-[10px] text-neutral-400">
            <span className="ops-muted">Jornada operacional</span>
            <strong className="ops-text mt-0.5 block text-xs font-semibold text-white">
              {formatOperationalDate(control?.status.operationalDate)}
            </strong>
          </div>
        </header>

        {!control ? (
          <p className="ops-surface rounded-md border border-white/10 bg-[#101010] p-5 text-sm text-neutral-400">
            {error ? `No se pudo cargar la operación: ${error}` : "Cargando estado operativo…"}
          </p>
        ) : (
          <>
            {error && <p role="alert" className="mb-3 rounded-sm border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">Última actualización falló ({error}). Mostrando el último estado conocido.</p>}

            <StorePanel control={control} nowMs={nowMs} onChanged={refresh} />

            <div className="mt-4 grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(310px,.85fr)]">
              <div className="min-w-0 space-y-4">
                <ScheduleEditor
                  config={control.config}
                  defaultConfig={control.defaultConfig}
                  updatedBy={control.configUpdatedBy?.email ?? control.configUpdatedBy?.uid ?? null}
                  onSaved={refresh}
                />
                <section className="ops-surface rounded-md border border-white/10 bg-[#101010] p-4" aria-labelledby="providers-title">
                  <div className="flex items-start justify-between gap-3">
                    <div><h2 id="providers-title" className="ops-text text-sm font-semibold text-white">Proveedores</h2><p className="ops-muted mt-1 text-xs text-neutral-400">Directorio de abastecimiento del local.</p></div>
                    <span className="rounded-sm border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-[9px] text-amber-200">Por configurar</span>
                  </div>
                  <p className="ops-muted mt-3 border-t border-white/10 pt-3 text-xs text-neutral-500">Aún no existe un registro estructurado de proveedores para esta tienda.</p>
                </section>
              </div>

              <aside className="min-w-0 space-y-4">
                <CashPanel onClosed={refresh} />
                <AuditLog events={control.events} />
                <section className="ops-surface rounded-md border border-white/10 bg-[#101010] p-4" aria-labelledby="actions-title">
                  <div className="flex items-start justify-between gap-3">
                    <div><h2 id="actions-title" className="ops-text text-sm font-semibold text-white">Acciones por hacer</h2><p className="ops-muted mt-1 text-xs text-neutral-400">Seguimiento de tareas de operación.</p></div>
                    <span className="rounded-sm border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-[9px] text-amber-200">Por configurar</span>
                  </div>
                  <p className="ops-muted mt-3 border-t border-white/10 pt-3 text-xs text-neutral-500">La lista de tareas requiere asignación, responsables y persistencia; todavía no se guardan tareas en el sistema.</p>
                </section>
              </aside>
            </div>

            <p className="ops-muted mt-4 text-[10px] text-neutral-500">
              Próxima mejora operativa: excepciones por feriados y fechas especiales. Los horarios semanales actuales siguen aplicándose hasta configurar esa capacidad.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
