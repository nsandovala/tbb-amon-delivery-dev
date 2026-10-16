"use client";

import { useEffect, useState } from "react";
import { StoreApiError, updateStoreHoursApi, type StoreHoursConfig, type Weekday } from "@/lib/api/store";
import { getScheduleTrackStyle, isValidScheduleTime } from "@/lib/schedule";
import { WEEKDAY_LABELS, WEEKDAY_ORDER } from "@/lib/store-status";

const TIME_MARKS = [0, 6, 12, 18, 24] as const;
const MINUTES_PER_DAY = 24 * 60;

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

function percent(minutes: number): number {
  return (minutes / MINUTES_PER_DAY) * 100;
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
    <section aria-labelledby="weekly-hours-title" className="rounded-lg border border-white/10 bg-[#101010] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d6a85c]">Planificación de tienda</p>
          <h2 id="weekly-hours-title" className="mt-1 text-lg font-semibold text-white">Horario semanal</h2>
          <p className="mt-1 text-xs leading-5 text-neutral-400">
            Zona horaria: {draft.timezone}. La apertura cuenta; el cierre deja de aceptar pedidos.
            {updatedBy && <> Último cambio por {updatedBy}.</>}
          </p>
        </div>
        {!config && (
          <span className="border border-red-400/30 bg-red-400/10 px-2.5 py-1 text-[11px] font-medium text-red-200">
            Falta guardar un horario
          </span>
        )}
      </div>

      <div className="mt-4" aria-label="Vista de horarios por día, escala de 00:00 a 24:00">
        <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 sm:grid-cols-[112px_minmax(0,1fr)_auto] sm:gap-4">
          <span className="hidden text-[10px] uppercase tracking-[0.12em] text-neutral-500 sm:block">Día</span>
          <div className="relative col-span-2 h-5 text-[10px] tabular-nums text-neutral-500 sm:col-span-1" aria-hidden="true">
            {TIME_MARKS.map((hour) => (
              <span
                key={hour}
                className="absolute -translate-x-1/2"
                style={{ left: `${percent(hour * 60)}%` }}
              >
                {String(hour).padStart(2, "0")}:00
              </span>
            ))}
          </div>
          <span className="hidden w-[170px] text-[10px] uppercase tracking-[0.12em] text-neutral-500 sm:block">Apertura / cierre</span>
        </div>

        <div className="divide-y divide-white/[0.07] border-y border-white/10">
          {WEEKDAY_ORDER.map((day) => {
            const schedule = draft.days[day];
            const trackStyle = getScheduleTrackStyle(schedule.open, schedule.close);
            const validWindow = schedule.enabled && trackStyle !== null;

            return (
              <div key={day} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 py-3 sm:grid-cols-[112px_minmax(0,1fr)_170px] sm:gap-x-4">
                <label className="flex min-w-0 items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={schedule.enabled}
                    onChange={(event) => updateDay(day, { enabled: event.target.checked })}
                    aria-label={`${WEEKDAY_LABELS[day]}: ${schedule.enabled ? "abierto" : "cerrado"}`}
                    className="h-4 w-4 shrink-0 accent-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
                  />
                  <span className="truncate text-sm font-medium text-neutral-200">{WEEKDAY_LABELS[day]}</span>
                </label>

                <div className="relative col-span-2 h-7 overflow-hidden border border-white/[0.07] bg-[#0b0e11] sm:col-span-1" aria-hidden="true">
                  {TIME_MARKS.slice(1, -1).map((hour) => (
                    <span
                      key={hour}
                      className="absolute inset-y-0 border-l border-white/[0.07]"
                      style={{ left: `${percent(hour * 60)}%` }}
                    />
                  ))}
                  {validWindow && trackStyle && (
                    <span
                      className="absolute inset-y-1 border-l-2 border-r-2 border-emerald-300 bg-emerald-400/25"
                      style={{ left: `${trackStyle.left}%`, width: `${trackStyle.width}%` }}
                    />
                  )}
                  {!schedule.enabled && (
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-[0.12em] text-neutral-600">
                      Cerrado
                    </span>
                  )}
                  {schedule.enabled && !validWindow && (
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] text-red-300">
                      Revisa el horario
                    </span>
                  )}
                </div>

                <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-1">
                  <label className="min-w-0">
                    <span className="mb-1 block text-[10px] uppercase tracking-[0.1em] text-neutral-500 sm:sr-only">{WEEKDAY_LABELS[day]} apertura</span>
                    <input
                      type="time"
                      step={60}
                      aria-label={`${WEEKDAY_LABELS[day]} apertura`}
                      value={schedule.open}
                      disabled={!schedule.enabled}
                      onChange={(event) => updateDay(day, { open: event.target.value })}
                      className="h-9 w-full rounded-sm border border-white/10 bg-[#090b0d] px-2 text-sm tabular-nums text-white [color-scheme:dark] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"
                    />
                  </label>
                  <label className="min-w-0">
                    <span className="mb-1 block text-[10px] uppercase tracking-[0.1em] text-neutral-500 sm:sr-only">{WEEKDAY_LABELS[day]} cierre</span>
                    <input
                      type="time"
                      step={60}
                      aria-label={`${WEEKDAY_LABELS[day]} cierre`}
                      value={schedule.close}
                      disabled={!schedule.enabled}
                      onChange={(event) => updateDay(day, { close: event.target.value })}
                      className="h-9 w-full rounded-sm border border-white/10 bg-[#090b0d] px-2 text-sm tabular-nums text-white [color-scheme:dark] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"
                    />
                  </label>
                </div>
              </div>
            );
          })}
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
          className="h-9 w-16 rounded-sm border border-white/10 bg-[#090b0d] px-2 text-sm tabular-nums text-white"
        />
        <span className="text-xs text-neutral-500">minutos · escala completa 00:00–24:00</span>
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

      {message && (
        <p role="status" className={["mt-3 border-l-2 pl-3 text-sm", message.ok ? "border-emerald-400 text-emerald-300" : "border-red-400 text-red-300"].join(" ")}>
          {message.text}
        </p>
      )}
    </section>
  );
}
