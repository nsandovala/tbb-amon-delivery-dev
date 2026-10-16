"use client";

import { useEffect, useState } from "react";
import { StoreApiError, updateStoreHoursApi, type StoreHoursConfig, type Weekday } from "@/lib/api/store";
import { isValidScheduleTime } from "@/lib/schedule";
import { WEEKDAY_LABELS, WEEKDAY_ORDER } from "@/lib/store-status";

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function validate(config: StoreHoursConfig): string[] {
  const errors: string[] = [];
  for (const day of WEEKDAY_ORDER) {
    const schedule = config.days[day];
    if (!schedule.enabled) continue;
    if (!isValidScheduleTime(schedule.open) || !isValidScheduleTime(schedule.close)) {
      errors.push(`${WEEKDAY_LABELS[day]}: usa una hora válida entre 00:00 y 23:59.`);
      continue;
    }
    const open = toMinutes(schedule.open);
    const close = toMinutes(schedule.close);
    if (!Number.isFinite(open) || !Number.isFinite(close)) {
      errors.push(`${WEEKDAY_LABELS[day]}: usa una hora válida entre 00:00 y 23:59.`);
    } else if (close <= open) {
      errors.push(`${WEEKDAY_LABELS[day]}: el cierre debe ser después de la apertura. El horario no puede cruzar medianoche.`);
    }
  }

  if (!Number.isInteger(config.closingWarningMinutes) || config.closingWarningMinutes < 0 || config.closingWarningMinutes > 120) {
    errors.push("El aviso de cierre debe estar entre 0 y 120 minutos.");
  }
  return errors;
}

export function ScheduleEditor({
  config,
  defaultConfig,
  updatedBy,
  onSaved,
}: {
  config: StoreHoursConfig | null;
  defaultConfig: StoreHoursConfig;
  updatedBy: string | null;
  onSaved: () => Promise<void> | void;
}) {
  const [draft, setDraft] = useState<StoreHoursConfig>(config ?? defaultConfig);
  const [dirty, setDirty] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // El polling no pisa una edición en curso.
  useEffect(() => {
    if (!dirty) setDraft(config ?? defaultConfig);
  }, [config, defaultConfig, dirty]);

  const errors = validate(draft);

  function updateDay(day: Weekday, patch: Partial<StoreHoursConfig["days"][Weekday]>) {
    setDraft((prev) => ({ ...prev, days: { ...prev.days, [day]: { ...prev.days[day], ...patch } } }));
    setDirty(true);
    setMessage(null);
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await updateStoreHoursApi(draft, reason.trim());
      setDirty(false);
      setReason("");
      setMessage({ ok: true, text: "Horario guardado. Aplica de inmediato." });
      await onSaved();
    } catch (err) {
      const text =
        err instanceof StoreApiError && Array.isArray(err.details)
          ? `${err.message}: ${(err.details as Array<{ message?: string }>).map((d) => d.message).join("; ")}`
          : err instanceof Error
            ? err.message
            : "No se pudo guardar.";
      setMessage({ ok: false, text });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="weekly-hours-title" className="ops-surface rounded-md border border-white/10 bg-[#101010] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">Calendario operativo</p>
          <h2 id="weekly-hours-title" className="ops-text mt-1 text-lg font-semibold text-white">Horario semanal</h2>
          <p className="ops-muted mt-1 text-xs leading-5 text-neutral-400">
            {draft.timezone} · La apertura cuenta; el cierre deja de aceptar pedidos.
            {updatedBy && <> Último cambio por {updatedBy}.</>}
          </p>
        </div>
        {!config && (
          <span className="rounded-sm border border-red-400/30 bg-red-400/10 px-2.5 py-1 text-[11px] font-medium text-red-200">
            Falta guardar un horario
          </span>
        )}
      </div>

      <div className="mt-4" aria-label="Horario semanal de la tienda">
        <div>
          <div className="hidden grid-cols-[minmax(110px,1fr)_minmax(150px,1.1fr)_220px] gap-3 border-y border-white/10 py-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-neutral-500 sm:grid">
            <span>Día</span><span>Atención</span><span className="text-center">Apertura · cierre</span>
          </div>
          <div className="divide-y divide-white/[0.07]">
          {WEEKDAY_ORDER.map((day) => {
            const schedule = draft.days[day];

            return (
              <div key={day} className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-x-2 gap-y-2 py-2.5 sm:grid-cols-[minmax(110px,1fr)_minmax(150px,1.1fr)_220px] sm:gap-3">
                <label className="flex min-w-0 items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={schedule.enabled}
                    onChange={(event) => updateDay(day, { enabled: event.target.checked })}
                    aria-label={`${WEEKDAY_LABELS[day]}: ${schedule.enabled ? "abierto" : "cerrado"}`}
                    className="h-4 w-4 shrink-0 accent-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
                  />
                  <span className="ops-text truncate text-xs font-medium text-neutral-200">{WEEKDAY_LABELS[day]}</span>
                </label>

                <div className="flex items-center gap-2">
                  <span className={["h-1.5 w-1.5 rounded-full", schedule.enabled ? "bg-emerald-400" : "bg-neutral-500"].join(" ")} />
                  <span className={["text-[11px]", schedule.enabled ? "text-emerald-200" : "text-neutral-500"].join(" ")}>
                    {schedule.enabled ? "Abierto" : "Cerrado"}
                  </span>
                  {schedule.enabled && <span className="ops-muted text-[10px] text-neutral-500">{schedule.open} – {schedule.close}</span>}
                </div>

                <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-1">
                  {(["open", "close"] as const).map((field) => (
                    <label key={field} className="min-w-0">
                      <span className="sr-only">{WEEKDAY_LABELS[day]} {field === "open" ? "apertura" : "cierre"}</span>
                      <input
                        type="time"
                        step={60}
                        aria-label={`${WEEKDAY_LABELS[day]} ${field === "open" ? "apertura" : "cierre"}`}
                        value={schedule[field]}
                        disabled={!schedule.enabled}
                        onChange={(event) => updateDay(day, { [field]: event.target.value })}
                        className="ops-input h-8 min-w-[96px] w-full rounded-sm border border-white/10 bg-[#090b0d] px-2 text-xs tabular-nums text-white [color-scheme:dark] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"
                      />
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-white/10 pt-4">
        <label htmlFor="closing-warning-minutes" className="text-xs text-neutral-400">Avisar antes del cierre</label>
        <input
          id="closing-warning-minutes"
          type="number"
          min={0}
          max={120}
          value={draft.closingWarningMinutes}
          onChange={(event) => {
            setDraft((prev) => ({ ...prev, closingWarningMinutes: Number(event.target.value) }));
            setDirty(true);
            setMessage(null);
          }}
          className="ops-input h-9 w-16 rounded-sm border border-white/10 bg-[#090b0d] px-2 text-sm tabular-nums text-white"
        />
        <span className="text-xs text-neutral-500">minutos · formato de 24 horas</span>
      </div>

      {errors.length > 0 && (
        <ul className="mt-3 space-y-1 border-l-2 border-red-400/60 pl-3 text-xs text-red-300" role="alert">
          {errors.map((error) => <li key={error}>{error}</li>)}
        </ul>
      )}

      {(dirty || !config) && (
        <div className="mt-4 grid gap-2 border-t border-white/10 pt-4 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <label className="min-w-0">
            <span className="sr-only">Motivo del cambio, opcional</span>
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={280}
              placeholder="Motivo del cambio (opcional; queda en auditoría)"
              className="h-10 w-full rounded-sm border border-white/10 bg-[#090b0d] px-3 text-sm text-white outline-none focus-visible:border-emerald-300"
            />
          </label>
          <button
            type="button"
            disabled={busy || errors.length > 0}
            onClick={save}
            className="min-h-10 border border-emerald-400/50 bg-emerald-400/10 px-4 text-sm font-semibold text-emerald-100 transition-colors hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Guardando…" : "Guardar horario"}
          </button>
          {dirty && config && (
            <button
              type="button"
              onClick={() => {
                setDraft(config);
                setDirty(false);
                setReason("");
                setMessage(null);
              }}
              className="min-h-10 border border-white/10 px-4 text-sm text-neutral-300 transition-colors hover:bg-white/5"
            >
              Descartar cambios
            </button>
          )}
        </div>
      )}

      <section className="mt-5 border-t border-white/10 pt-4" aria-labelledby="special-dates-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="special-dates-title" className="ops-text text-sm font-semibold text-white">¿Abrirás en feriados o fechas especiales?</h3>
            <p className="ops-muted mt-1 max-w-2xl text-xs leading-5 text-neutral-400">
              Aún no se puede programar esa decisión. Falta guardar por fecha si abrirás, cerrarás o usarás otro horario, y comunicarlo a los clientes antes de aceptar pedidos.
            </p>
          </div>
          <span className="rounded-sm border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-[10px] text-amber-200">Por configurar</span>
        </div>
      </section>

      {message && (
        <p role="status" className={["mt-3 border-l-2 pl-3 text-sm", message.ok ? "border-emerald-400 text-emerald-300" : "border-red-400 text-red-300"].join(" ")}>
          {message.text}
        </p>
      )}
    </section>
  );
}
