"use client";

import { fetchStoreControl } from "@/lib/api/store";
import { usePolledStoreStatus } from "@/hooks/use-store-status";
import { StorePanel } from "@/components/operation/store-panel";
import { CashPanel } from "@/components/operation/cash-panel";
import { ScheduleEditor } from "@/components/operation/schedule-editor";
import { AuditLog } from "@/components/operation/audit-log";

/**
 * M6J — Sala de control: estado de tienda, acción manual, horario, bitácora y caja.
 * Toda escritura pasa por Functions (backend es fuente de verdad y fail-closed).
 */
export default function OperacionPage() {
  const { data: control, error, nowMs, refresh } = usePolledStoreStatus(fetchStoreControl);

  return (
    <main className="min-h-screen bg-[#0B0B0B] text-white">
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6">
          <p className="text-xs uppercase tracking-[0.25em] text-emerald-400/80">Sala de control</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">Operación y caja</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Qué está pasando ahora, quién lo decidió y cuánto dinero debería haber. Tienda y caja son operaciones distintas.
          </p>
        </header>

        {!control ? (
          <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-neutral-400">
            {error ? `No se pudo cargar la operación: ${error}` : "Cargando estado operativo…"}
          </p>
        ) : (
          <>
            {error && (
              <p role="alert" className="mb-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm text-amber-200">
                Última actualización falló ({error}). Mostrando el último estado conocido.
              </p>
            )}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <div className="space-y-6">
                <StorePanel control={control} nowMs={nowMs} onChanged={refresh} />
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <ScheduleEditor
                    config={control.config}
                    defaultConfig={control.defaultConfig}
                    updatedBy={control.configUpdatedBy?.email ?? control.configUpdatedBy?.uid ?? null}
                    onSaved={refresh}
                  />
                  <AuditLog events={control.events} />
                </div>
              </div>
              <CashPanel onClosed={refresh} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
