"use client";

import { useState } from "react";
import {
  deleteStoreDateExceptionApi,
  StoreApiError,
  updateStoreDateExceptionApi,
  type StoreDateException,
  type StoreHoursConfig,
  type Weekday,
} from "@/lib/api/store";
import { formatOperationalDate } from "@/lib/store-status";

type ExceptionMode = StoreDateException["mode"];

function weekdayFor(date: string): Weekday {
  const index = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  return (["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const)[index] ?? "monday";
}

function describeException(exception: StoreDateException, config: StoreHoursConfig | null): string {
  if (exception.mode === "closed") return "Cerrado";
  if (exception.mode === "custom_hours") return `${exception.open}–${exception.close}`;
  const day = config?.days[weekdayFor(exception.date)];
  return day?.enabled ? `Horario habitual · ${day.open}–${day.close}` : "Horario semanal (día cerrado)";
}

export function SpecialDatesEditor({
  exceptions,
  config,
  today,
  onChanged,
}: {
  exceptions: StoreDateException[];
  config: StoreHoursConfig | null;
  today: string;
  onChanged: () => Promise<void> | void;
}) {
  const [date, setDate] = useState(today);
  const [mode, setMode] = useState<ExceptionMode>("closed");
  const [open, setOpen] = useState("17:30");
  const [close, setClose] = useState("22:30");
  const [customerMessage, setCustomerMessage] = useState("");
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const selectedDay = weekdayFor(date);
  const regularScheduleEnabled = Boolean(config?.days[selectedDay]?.enabled);

  function resetForm(nextDate = today) {
    setDate(nextDate);
    setMode("closed");
    setOpen("17:30");
    setClose("22:30");
    setCustomerMessage("");
    setEditingDate(null);
  }

  function edit(exception: StoreDateException) {
    setDate(exception.date);
    setMode(exception.mode);
    setOpen(exception.open ?? "17:30");
    setClose(exception.close ?? "22:30");
    setCustomerMessage(exception.customerMessage ?? "");
    setEditingDate(exception.date);
    setMessage(null);
  }

  async function save() {
    if (!date || date < today) {
      setMessage({ ok: false, text: "Elige hoy o una fecha futura." });
      return;
    }
    if (mode === "regular_hours" && !regularScheduleEnabled) {
      setMessage({ ok: false, text: "Ese día normalmente está cerrado. Define un horario especial para abrirlo." });
      return;
    }
    if (mode === "custom_hours" && close <= open) {
      setMessage({ ok: false, text: "El cierre debe ser posterior a la apertura del mismo día." });
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const exception: StoreDateException = {
        date,
        mode,
        ...(mode === "custom_hours" ? { open, close } : {}),
        ...(customerMessage.trim() ? { customerMessage: customerMessage.trim() } : {}),
      };
      await updateStoreDateExceptionApi(exception);
      setMessage({ ok: true, text: `Excepción del ${formatOperationalDate(date)} guardada.` });
      resetForm(date);
      await onChanged();
    } catch (err) {
      setMessage({
        ok: false,
        text: err instanceof StoreApiError ? err.message : err instanceof Error ? err.message : "No se pudo guardar la fecha.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function remove(exception: StoreDateException) {
    if (!window.confirm(`¿Eliminar la excepción del ${formatOperationalDate(exception.date)}?`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await deleteStoreDateExceptionApi(exception.date);
      if (editingDate === exception.date) resetForm();
      setMessage({ ok: true, text: `Excepción del ${formatOperationalDate(exception.date)} eliminada.` });
      await onChanged();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "No se pudo eliminar la fecha." });
    } finally {
      setBusy(false);
    }
  }

  const sortedExceptions = [...exceptions].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <section className="mt-5 border-t border-white/10 pt-4" aria-labelledby="special-dates-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="special-dates-title" className="ops-text text-sm font-semibold text-white">¿Abrirás en feriados o fechas especiales?</h3>
          <p className="ops-muted mt-1 max-w-2xl text-xs leading-5 text-neutral-400">
            Configura una decisión por fecha. La tienda la mostrará a los clientes y Functions la aplicará al aceptar pedidos.
          </p>
        </div>
        <span className="rounded-sm border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-200">
          {sortedExceptions.length ? `${sortedExceptions.length} configurada${sortedExceptions.length === 1 ? "" : "s"}` : "Sin fechas"}
        </span>
      </div>

      <div className="ops-surface mt-4 grid gap-3 rounded-sm border border-white/10 bg-[#090b0d] p-3 sm:grid-cols-[minmax(140px,.8fr)_minmax(180px,1fr)_minmax(200px,1.2fr)] sm:items-end">
        <label className="block text-[10px] font-medium text-neutral-400">
          Fecha
          <input
            type="date"
            min={today}
            value={date}
            onChange={(event) => { setDate(event.target.value); setEditingDate(null); setMessage(null); }}
            className="ops-input mt-1 h-9 w-full rounded-sm border border-white/10 bg-[#090b0d] px-2 text-xs text-white"
          />
        </label>

        <label className="block text-[10px] font-medium text-neutral-400">
          Decisión para ese día
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as ExceptionMode)}
            className="ops-input mt-1 h-9 w-full rounded-sm border border-white/10 bg-[#090b0d] px-2 text-xs text-white"
          >
            <option value="closed">Permanecer cerrado</option>
            <option value="regular_hours" disabled={!regularScheduleEnabled}>Abrir con horario habitual</option>
            <option value="custom_hours">Abrir con horario especial</option>
          </select>
        </label>

        {mode === "custom_hours" ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] font-medium text-neutral-400">Apertura
              <input type="time" step={60} value={open} onChange={(event) => setOpen(event.target.value)} className="ops-input mt-1 h-9 w-full rounded-sm border border-white/10 bg-[#090b0d] px-2 text-xs text-white [color-scheme:dark]" />
            </label>
            <label className="text-[10px] font-medium text-neutral-400">Cierre
              <input type="time" step={60} value={close} onChange={(event) => setClose(event.target.value)} className="ops-input mt-1 h-9 w-full rounded-sm border border-white/10 bg-[#090b0d] px-2 text-xs text-white [color-scheme:dark]" />
            </label>
          </div>
        ) : (
          <p className="ops-muted self-center text-[11px] text-neutral-500">
            {mode === "regular_hours" ? describeException({ date, mode }, config) : "Los pedidos quedarán bloqueados esa fecha."}
          </p>
        )}

        <label className="block text-[10px] font-medium text-neutral-400 sm:col-span-2">
          Mensaje para clientes (opcional)
          <input
            maxLength={160}
            value={customerMessage}
            onChange={(event) => setCustomerMessage(event.target.value)}
            placeholder="Ej.: Este feriado atenderemos desde las 18:00."
            className="ops-input mt-1 h-9 w-full rounded-sm border border-white/10 bg-[#090b0d] px-2 text-xs text-white placeholder:text-neutral-500"
          />
        </label>
        <div className="flex gap-2 sm:justify-end">
          {editingDate && <button type="button" disabled={busy} onClick={() => resetForm()} className="min-h-9 border border-white/10 px-3 text-xs text-neutral-300">Cancelar</button>}
          <button type="button" disabled={busy || !date} onClick={() => void save()} className="min-h-9 border border-emerald-400/50 bg-emerald-400/10 px-3 text-xs font-semibold text-emerald-100 hover:bg-emerald-400/20 disabled:opacity-50">
            {busy ? "Guardando…" : editingDate ? "Actualizar fecha" : "Guardar fecha"}
          </button>
        </div>
      </div>

      {sortedExceptions.length > 0 && (
        <ul className="mt-3 divide-y divide-white/10 border-y border-white/10">
          {sortedExceptions.map((exception) => (
            <li key={exception.date} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <strong className="ops-text text-xs font-semibold text-white">{formatOperationalDate(exception.date)}</strong>
                <span className="ops-muted ml-2 text-xs text-neutral-400">{describeException(exception, config)}</span>
                {exception.customerMessage && <p className="ops-muted mt-1 truncate text-[11px] text-neutral-500">{exception.customerMessage}</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" disabled={busy} onClick={() => edit(exception)} className="px-2 py-1 text-[11px] font-medium text-emerald-300 hover:text-emerald-200">Editar</button>
                <button type="button" disabled={busy} onClick={() => void remove(exception)} className="px-2 py-1 text-[11px] font-medium text-red-300 hover:text-red-200">Eliminar</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {message && <p role={message.ok ? "status" : "alert"} className={`mt-3 border-l-2 pl-3 text-xs ${message.ok ? "border-emerald-400 text-emerald-300" : "border-red-400 text-red-300"}`}>{message.text}</p>}
    </section>
  );
}
