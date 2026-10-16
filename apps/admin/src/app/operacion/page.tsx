"use client";

import { fetchStoreControl } from "@/lib/api/store";
import { usePolledStoreStatus } from "@/hooks/use-store-status";
import { StorePanel } from "@/components/operation/store-panel";
import { CashPanel } from "@/components/operation/cash-panel";
import { ScheduleEditor } from "@/components/operation/schedule-editor";
import { AuditLog } from "@/components/operation/audit-log";

function JourneyStrip({
  control,
}: {
  control: Awaited<ReturnType<typeof fetchStoreControl>>;
}) {
  const acceptingOrders = control.status.acceptingOrders;
  const cashClosed = control.status.reasonCode === "CASH_CLOSED";
  const steps = [
    {
      label: "Jornada",
      value: control.status.operationalDate ?? "Sin fecha",
      detail: control.status.state === "closed" ? "Cerrada" : "Activa",
      state: control.status.state === "closed" ? "done" : "live",
    },
    {
      label: "Pedidos",
      value: acceptingOrders ? "Recibiendo" : "Bloqueados",
      detail: acceptingOrders ? "Web + POS" : "No entran nuevos pedidos",
      state: acceptingOrders ? "live" : "attention",
    },
    {
      label: "Cierre de tienda",
      value: acceptingOrders ? "Pendiente" : "Ejecutado",
      detail: acceptingOrders ? "Se activa al terminar la operación" : "Tienda sin pedidos nuevos",
      state: acceptingOrders ? "next" : "done",
    },
    {
      label: "Cierre de caja",
      value: cashClosed ? "Registrado" : "Pendiente",
      detail: cashClosed ? "Jornada protegida" : "Arqueo en panel de caja",
      state: cashClosed ? "done" : "next",
    },
  ];

  return (
    <section className="mb-6 rounded-md border border-white/10 bg-[#0c0f0f]/85 p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-[#d6a85c]">Ruta de la jornada</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Estado operativo en una vista</h2>
        </div>
        <p className="text-xs text-neutral-500">La siguiente acción queda visible antes de entrar al detalle.</p>
      </div>
      <div className="grid gap-2 md:grid-cols-4">
        {steps.map((step) => (
          <div key={step.label} className="rounded-md border border-white/8 bg-white/[0.02] px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">{step.label}</p>
              <span className={[
                "h-1.5 w-1.5 rounded-full",
                step.state === "live" ? "bg-emerald-400" : step.state === "attention" ? "bg-red-400" : step.state === "done" ? "bg-[#d6a85c]" : "bg-neutral-600",
              ].join(" ")} />
            </div>
            <p className="mt-2 text-sm font-semibold text-white">{step.value}</p>
            <p className="mt-1 text-[11px] leading-4 text-neutral-500">{step.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * M6J — Sala de control: estado de tienda, acción manual, horario, bitácora y caja.
 * Toda escritura pasa por Functions (backend es fuente de verdad y fail-closed).
 */
export default function OperacionPage() {
  const { data: control, error, nowMs, refresh } = usePolledStoreStatus(fetchStoreControl);

  return (
    <main data-admin-surface="operations" className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6">
          <p className="text-xs uppercase tracking-[0.25em] text-[#d6a85c]">Sala de control</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">Operación y caja</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Qué está pasando ahora, quién lo decidió y cuánto dinero debería haber. Tienda y caja son operaciones distintas.
          </p>
        </header>

        {!control ? (
          <p className="rounded-md border border-white/10 bg-white/[0.03] p-6 text-sm text-neutral-400">
            {error ? `No se pudo cargar la operación: ${error}` : "Cargando estado operativo…"}
          </p>
        ) : (
          <>
            {error && (
              <p role="alert" className="mb-4 rounded-md border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm text-amber-200">
                Última actualización falló ({error}). Mostrando el último estado conocido.
              </p>
            )}
            <JourneyStrip control={control} />
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
