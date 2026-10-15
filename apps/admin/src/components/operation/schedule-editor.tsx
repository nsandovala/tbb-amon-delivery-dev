"use client";

import { useEffect, useState } from "react";
import { StoreApiError, updateStoreHoursApi, type StoreHoursConfig, type Weekday } from "@/lib/api/store";
import { WEEKDAY_LABELS, WEEKDAY_ORDER } from "@/lib/store-status";

function toMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

function validate(config: StoreHoursConfig): string[] {
  const errors: string[] = [];
  for (const day of WEEKDAY_ORDER) {
    const schedule = config.days[day];
    if (!schedule.enabled) continue;
    if (!/^\d{2}:\d{2}$/.test(schedule.open) || !/^\d{2}:\d{2}$/.test(schedule.close)) {
      errors.push(`${WEEKDAY_LABELS[day]}: usa horas HH:MM.`);
    } else if (toMinutes(schedule.close) <= toMinutes(schedule.open)) {
      errors.push(`${WEEKDAY_LABELS[day]}: el cierre debe ser después de la apertura (no se admite cruzar medianoche).`);
    }
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
    <section className="rounded-3xl border border-white/10 bg-[#101010] p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-neutral-500">Horario semanal</p>
          <p className="mt-1 text-xs text-neutral-500">
            Hora local {draft.timezone}. Apertura inclusiva, cierre exclusivo.
            {updatedBy && <> Última edición: {updatedBy}.</>}
          </p>
        </div>
        {!config && <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-bold text-red-200">Sin horario guardado</span>}
      </div>

      <div className="mt-4 divide-y divide-white/5">
        {WEEKDAY_ORDER.map((day) => {
          const schedule = draft.days[day];
          return (
            <div key={day} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-2 sm:grid-cols-[140px_auto_auto_1fr]">
              <label className="flex items-center gap-2 text-sm font-semibold text-white">
                <input
                  type="checkbox"
                  checked={schedule.enabled}
                  onChange={(event) => updateDay(day, { enabled: event.target.checked })}
                />
                {WEEKDAY_LABELS[day]}
              </label>
              <input
                type="time"
                step={60}
                aria-label={`${WEEKDAY_LABELS[day]} apertura`}
                value={schedule.open}
                disabled={!schedule.enabled}
                onChange={(event) => updateDay(day, { open: event.target.value })}
                className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm tabular-nums text-white disabled:opacity-30 [color-scheme:dark]"
              />
              <input
                type="time"
                step={60}
                aria-label={`${WEEKDAY_LABELS[day]} cierre`}
                value={schedule.close}
                disabled={!schedule.enabled}
                onChange={(event) => updateDay(day, { close: event.target.value })}
                className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm tabular-nums text-white disabled:opacity-30 [color-scheme:dark]"
              />
              <span className="hidden text-xs text-neutral-500 sm:block">{schedule.enabled ? "" : "Sin atención"}</span>
            </div>
          );
        })}
      </div>

      <label className="mt-3 flex items-center gap-2 text-xs text-neutral-400">
        Aviso “cierra pronto”
        <input
          type="number"
          min={0}
          max={120}
          value={draft.closingWarningMinutes}
          onChange={(event) => {
            setDraft((prev) => ({ ...prev, closingWarningMinutes: Number(event.target.value) }));
            setDirty(true);
          }}
          className="w-16 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm text-white"
        />
        minutos antes del cierre
      </label>

      {errors.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-red-300">
          {errors.map((error) => <li key={error}>{error}</li>)}
        </ul>
      )}

      {(dirty || !config) && (
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={280}
            placeholder="Motivo del cambio (auditoría)"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
          />
          <button
            type="button"
            disabled={busy || errors.length > 0}
            onClick={save}
            className="rounded-xl border border-emerald-400/40 bg-emerald-400/15 px-4 py-2 text-sm font-bold text-emerald-100 disabled:opacity-40"
          >
            {busy ? "Guardando…" : "Guardar horario"}
          </button>
          {dirty && config && (
            <button
              type="button"
              onClick={() => {
                setDraft(config);
                setDirty(false);
              }}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-neutral-300"
            >
              Descartar
            </button>
          )}
        </div>
      )}

      {message && (
        <p role="status" className={["mt-2 text-sm", message.ok ? "text-emerald-300" : "text-red-300"].join(" ")}>
          {message.text}
        </p>
      )}
    </section>
  );
}
