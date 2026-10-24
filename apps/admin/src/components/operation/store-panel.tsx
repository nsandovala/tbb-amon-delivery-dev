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
  formatOperationalDate,
  getNextTransition,
  getStoreTone,
  STORE_STATE_LABELS,
  TONE_CLASSES,
} from "@/lib/store-status";
import { useActiveTenant } from "@/components/tenant-provider";

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
  const { tenantId } = useActiveTenant();
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
      const result = await setStoreOperationApi(tenantId, action, reason.trim());
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
      await updateStoreHoursApi(tenantId, control.defaultConfig, "Horario inicial 17:30–22:30");
      setFeedback({ ok: true, text: "Horario 17:30–22:30 creado. Revísalo abajo." });
      await onChanged();
    } catch (err) {
      setFeedback({ ok: false, text: err instanceof Error ? err.message : "No se pudo crear." });
    } finally {
      setBusy(false);
    }
  }

  const overrideActor = status.override?.actor?.email ?? status.override?.actor?.uid;
  const stateTone = toneKey === "green"
    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
    : toneKey === "amber"
      ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
      : "border-red-400/30 bg-red-400/10 text-red-300";

  return (
    <section aria-labelledby="store-zone" className="ops-surface rounded-md border border-white/10 bg-[#101010] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-4" aria-live="polite">
        <div className="flex min-w-0 items-center gap-3">
          <span className={["h-2.5 w-2.5 shrink-0 rounded-full", tone.dot, status.acceptingOrders ? "animate-pulse" : ""].join(" ")} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="store-zone" className="ops-text text-sm font-semibold text-white">Estado de la tienda</h2>
              <span className={["rounded-sm border px-2 py-0.5 text-[10px] font-semibold", stateTone].join(" ")}>{STORE_STATE_LABELS[status.state]}</span>
            </div>
            <p className="ops-muted mt-1 truncate text-xs text-neutral-400">{status.acceptingOrders ? "Recibiendo pedidos web y POS" : "No recibe pedidos"} · {status.message}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="ops-text font-mono text-lg font-semibold tabular-nums text-white">{clock.time}</p>
            <p className="ops-muted text-[10px] capitalize text-neutral-400">{clock.date}</p>
          </div>
          {actions.length === 1 && !pending && (
            <button type="button" onClick={() => setPending(actions[0])} className={["rounded-sm border px-3 py-2 text-xs font-semibold", ACTION_COPY[actions[0]].tone].join(" ")}>
              {actions[0] === "close" ? "Cerrar tienda" : ACTION_COPY[actions[0]].title}
            </button>
          )}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-white/10 pt-3 sm:grid-cols-4">
        <div><dt className="ops-muted text-[9px] uppercase tracking-wide text-neutral-500">Próximo cambio</dt><dd className="ops-text mt-1 text-xs font-semibold text-white">{next.label} · {formatStoreTime(next.at, status.timezone)} {countdown && <span className="ops-muted font-normal text-neutral-400">({countdown})</span>}</dd></div>
        <div><dt className="ops-muted text-[9px] uppercase tracking-wide text-neutral-500">Horario hoy</dt><dd className="ops-text mt-1 text-xs font-semibold text-white">{status.today ? (status.today.enabled ? `${status.today.open}–${status.today.close}` : "Sin atención") : "—"}</dd></div>
        <div><dt className="ops-muted text-[9px] uppercase tracking-wide text-neutral-500">Control</dt><dd className="ops-text mt-1 text-xs font-semibold text-white">{status.source === "manual" ? "Manual" : status.source === "schedule" ? "Horario" : "Bloqueo"}</dd></div>
        <div><dt className="ops-muted text-[9px] uppercase tracking-wide text-neutral-500">Jornada</dt><dd className="ops-text mt-1 text-xs font-semibold text-white">{formatOperationalDate(status.operationalDate)}</dd></div>
      </dl>

      {status.override && (
        <p className="ops-subtle mt-3 rounded-sm border border-white/10 bg-black/30 px-3 py-2 text-xs text-neutral-300">
          <span className="ops-text font-semibold text-white">{status.override.mode === "closed" ? "Cerrada" : "Abierta"} manualmente</span>
          {overrideActor && <> por {overrideActor}</>}{status.override.at && <> a las {formatStoreTime(status.override.at, status.timezone)}</>}
          {status.override.reason && <> · “{status.override.reason}”</>}
        </p>
      )}

      {(actions.length > 1 || pending || configBroken || cashClosed) && <div className="mt-4 border-t border-white/10 pt-3">
        <p className="ops-muted text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Acciones de tienda</p>

        {configBroken && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-sm border border-red-500/30 bg-red-500/10 p-3">
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
                className="rounded-sm border border-emerald-400/40 bg-emerald-400/15 px-3 py-2 text-xs font-bold text-emerald-100 hover:bg-emerald-400/25 disabled:opacity-50"
              >
                Crear horario 17:30–22:30
              </button>
            )}
          </div>
        )}

        {cashClosed && (
          <p className="mt-3 rounded-sm border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
            La caja de hoy ya fue cerrada: la jornada no puede reabrirse hasta el próximo día operacional.
          </p>
        )}

        {actions.length > 0 && !pending && (
          <div className="mt-3 flex flex-wrap gap-2">
            {actions.map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => {
                  setPending(action);
                  setFeedback(null);
                }}
                className={[
                  "flex min-h-10 items-center gap-2 rounded-sm border px-3 text-xs font-semibold transition-colors",
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
          <div className="mt-3 space-y-3 rounded-sm border border-white/10 bg-black/30 p-3">
            <p className="text-sm text-neutral-200">{ACTION_COPY[pending].confirm}</p>
          <label className="ops-muted block text-xs text-neutral-400">
              Motivo (opcional, queda en auditoría)
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={280}
                placeholder="Ej: se acabó el pan"
                className="ops-input mt-1 w-full rounded-sm border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => run(pending)}
                className={["min-h-10 rounded-sm border px-4 text-xs font-bold disabled:opacity-50", ACTION_COPY[pending].tone].join(" ")}
              >
                {busy ? "Aplicando…" : `Confirmar: ${pending === "open" && status.state === "manual_closed" ? "Reabrir tienda" : ACTION_COPY[pending].title}`}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setPending(null)}
                className="min-h-10 rounded-sm border border-white/10 px-4 text-xs text-neutral-300 hover:bg-white/5"
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

        <ul className="ops-muted mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-neutral-500">
          <li className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Abierta</li>
          <li className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Requiere atención</li>
          <li className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Cerrada</li>
          <li className="flex items-center gap-1.5"><Clock3 className="h-3 w-3" /> Hora oficial · {status.timezone}</li>
        </ul>
      </div>}
    </section>
  );
}
