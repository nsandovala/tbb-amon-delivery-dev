"use client";

import { useState } from "react";
import { Clock3, DoorClosed, DoorOpen, RotateCcw, ShieldAlert } from "lucide-react";
import {
  setStoreOperationApi,
  updateStoreHoursApi,
  type StoreControl,
} from "@/lib/api/store";
import {
  formatCountdown,
  formatStoreClock,
  formatStoreTime,
  getNextTransition,
  getStoreTone,
  STORE_STATE_LABELS,
  TONE_CLASSES,
} from "@/lib/store-status";

type Action = "open" | "close" | "resume_schedule";

const ACTION_COPY: Record<Action, { title: string; confirm: string; tone: string }> = {
  close: {
    title: "Cerrar tienda ahora",
    confirm: "Bloquea de inmediato nuevos pedidos web y POS. Los pedidos en curso no se tocan.",
    tone: "border-red-500/40 bg-red-500/15 text-red-200 hover:bg-red-500/25",
  },
  open: {
    title: "Abrir tienda",
    confirm: "Acepta pedidos web y POS hasta el corte de las 05:00 o hasta un cierre manual.",
    tone: "border-amber-400/40 bg-amber-400/15 text-amber-100 hover:bg-amber-400/25",
  },
  resume_schedule: {
    title: "Volver al horario",
    confirm: "Quita el control manual: la tienda sigue el horario configurado.",
    tone: "border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.1]",
  },
};

export function StorePanel({
  control,
  nowMs,
  onChanged,
}: {
  control: StoreControl;
  nowMs: number;
  onChanged: () => Promise<void> | void;
}) {
  const { status } = control;
  const toneKey = getStoreTone(status.state);
  const tone = TONE_CLASSES[toneKey];
  const clock = formatStoreClock(nowMs, status.timezone);
  const next = getNextTransition(status);
  const countdown = formatCountdown(next.at, nowMs);

  const [pending, setPending] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const cashClosed = status.reasonCode === "CASH_CLOSED";
  const configBroken = !status.configValid;

  const actions: Action[] = cashClosed || configBroken
    ? []
    : status.state === "manual_closed"
      ? ["open", "resume_schedule"]
      : status.state === "manual_open"
        ? ["close", "resume_schedule"]
        : status.acceptingOrders
          ? ["close"]
          : ["open"];

  async function run(action: Action) {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await setStoreOperationApi(action, reason.trim());
      setFeedback({
        ok: true,
        text: result.changed
          ? `Listo: ${STORE_STATE_LABELS[result.status.state]}.`
          : "Sin cambios: la tienda ya estaba en ese estado.",
      });
      setPending(null);
      setReason("");
      await onChanged();
    } catch (err) {
      setFeedback({ ok: false, text: err instanceof Error ? err.message : "No se pudo aplicar." });
    } finally {
      setBusy(false);
    }
  }

  async function createDefaultSchedule() {
    setBusy(true);
    setFeedback(null);
    try {
      await updateStoreHoursApi(control.defaultConfig, "Horario inicial 17:30–22:30");
      setFeedback({ ok: true, text: "Horario 17:30–22:30 creado. Revísalo abajo." });
      await onChanged();
    } catch (err) {
      setFeedback({ ok: false, text: err instanceof Error ? err.message : "No se pudo crear." });
    } finally {
      setBusy(false);
    }
  }

  const overrideActor = status.override?.actor?.email ?? status.override?.actor?.uid;

  return (
    <section aria-labelledby="store-zone" className="space-y-4">
      <div
        className={["rounded-lg border p-6 sm:p-8", tone.border, tone.bg, tone.glow].join(" ")}
        aria-live="polite"
      >
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <p id="store-zone" className="text-[11px] font-semibold uppercase tracking-[0.3em] text-neutral-400">
              Tienda · estado efectivo
            </p>
            <div className="mt-3 flex items-center gap-3">
              <span
                className={["h-5 w-5 shrink-0 rounded-full", tone.dot, status.acceptingOrders ? "animate-pulse" : ""].join(" ")}
              />
              <h2 className={["text-4xl font-black uppercase tracking-tight sm:text-6xl", tone.text].join(" ")}>
                {STORE_STATE_LABELS[status.state]}
              </h2>
            </div>
            <p className="mt-3 text-xl font-bold text-white sm:text-2xl">
              {status.acceptingOrders ? "Recibiendo pedidos web y POS" : "No recibe pedidos"}
            </p>
            <p className="mt-2 max-w-xl text-sm text-neutral-300">{status.message}</p>
          </div>

          <div className="text-right">
            <p className="font-mono text-5xl font-black tabular-nums text-white sm:text-6xl">{clock.time}</p>
            <p className="mt-1 text-sm capitalize text-neutral-400">{clock.date}</p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-neutral-500">{status.timezone}</p>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-md border border-white/10 bg-black/30 px-4 py-3">
            <dt className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">{next.label}</dt>
            <dd className="mt-1 text-2xl font-black tabular-nums text-white">
              {formatStoreTime(next.at, status.timezone)}
            </dd>
            {countdown && <dd className="text-xs text-neutral-400">{countdown}</dd>}
          </div>
          <div className="rounded-md border border-white/10 bg-black/30 px-4 py-3">
            <dt className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Horario hoy</dt>
            <dd className="mt-1 text-2xl font-black tabular-nums text-white">
              {status.today ? (status.today.enabled ? `${status.today.open}–${status.today.close}` : "Sin atención") : "—"}
            </dd>
          </div>
          <div className="rounded-md border border-white/10 bg-black/30 px-4 py-3">
            <dt className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Control</dt>
            <dd className="mt-1 text-2xl font-black text-white">
              {status.source === "manual" ? "Manual" : status.source === "schedule" ? "Horario" : "Bloqueo"}
            </dd>
          </div>
          <div className="rounded-md border border-white/10 bg-black/30 px-4 py-3">
            <dt className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Día operacional</dt>
            <dd className="mt-1 text-2xl font-black tabular-nums text-white">{status.operationalDate ?? "—"}</dd>
          </div>
        </dl>

        {status.override && (
          <p className="mt-4 rounded-md border border-white/10 bg-black/30 px-4 py-3 text-sm text-neutral-300">
            <span className="font-semibold text-white">
              {status.override.mode === "closed" ? "Cerrada" : "Abierta"} manualmente
            </span>
            {overrideActor && <> por {overrideActor}</>}
            {status.override.at && <> a las {formatStoreTime(status.override.at, status.timezone)}</>}
            {status.override.reason && <> · “{status.override.reason}”</>}
          </p>
        )}
      </div>

      <div className="rounded-lg border border-white/10 bg-[#101010] p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-neutral-500">Acción manual</p>

        {configBroken && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-red-500/30 bg-red-500/10 p-4">
            <ShieldAlert className="h-5 w-5 text-red-300" />
            <p className="flex-1 text-sm text-red-100">
              Fail-closed: sin horario válido el backend rechaza todos los pedidos.
              {status.configErrors?.length ? ` Errores: ${status.configErrors.join("; ")}` : ""}
            </p>
            {!control.config && (
              <button
                type="button"
                disabled={busy}
                onClick={createDefaultSchedule}
                className="rounded-md border border-emerald-400/40 bg-emerald-400/15 px-4 py-2 text-sm font-bold text-emerald-100 hover:bg-emerald-400/25 disabled:opacity-50"
              >
                Crear horario 17:30–22:30
              </button>
            )}
          </div>
        )}

        {cashClosed && (
          <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
            La caja de hoy ya fue cerrada: la jornada no puede reabrirse hasta el próximo día operacional.
          </p>
        )}

        {actions.length > 0 && !pending && (
          <div className="mt-3 flex flex-wrap gap-3">
            {actions.map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => {
                  setPending(action);
                  setFeedback(null);
                }}
                className={[
                  "flex min-h-14 items-center gap-2 rounded-md border px-5 text-base font-bold transition-colors",
                  ACTION_COPY[action].tone,
                ].join(" ")}
              >
                {action === "close" ? <DoorClosed className="h-5 w-5" /> : action === "open" ? <DoorOpen className="h-5 w-5" /> : <RotateCcw className="h-5 w-5" />}
                {action === "open" && status.state === "manual_closed" ? "Reabrir tienda" : ACTION_COPY[action].title}
              </button>
            ))}
          </div>
        )}

        {pending && (
          <div className="mt-3 space-y-3 rounded-md border border-white/10 bg-black/30 p-4">
            <p className="text-sm text-neutral-200">{ACTION_COPY[pending].confirm}</p>
            <label className="block text-xs text-neutral-400">
              Motivo (opcional, queda en auditoría)
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={280}
                placeholder="Ej: se acabó el pan"
                className="mt-1 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-white/30"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => run(pending)}
                className={["min-h-12 rounded-md border px-5 text-sm font-bold disabled:opacity-50", ACTION_COPY[pending].tone].join(" ")}
              >
                {busy ? "Aplicando…" : `Confirmar: ${pending === "open" && status.state === "manual_closed" ? "Reabrir tienda" : ACTION_COPY[pending].title}`}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setPending(null)}
                className="min-h-12 rounded-md border border-white/10 px-5 text-sm text-neutral-300 hover:bg-white/5"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {feedback && (
          <p role="status" className={["mt-3 text-sm", feedback.ok ? "text-emerald-300" : "text-red-300"].join(" ")}>
            {feedback.text}
          </p>
        )}

        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-neutral-500">
          <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Verde: recibe pedidos por horario</li>
          <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" /> Ámbar: recibe, requiere atención</li>
          <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" /> Rojo: no recibe pedidos</li>
          <li className="flex items-center gap-1.5"><Clock3 className="h-3 w-3" /> Hora oficial de la tienda, no del dispositivo</li>
        </ul>
      </div>
    </section>
  );
}
