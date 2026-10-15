"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Lock, Wallet } from "lucide-react";
import {
  closeCashSessionApi,
  fetchCashCloseDay,
  StoreApiError,
  type CashCloseDay,
  type CashCloseRecord,
} from "@/lib/api/store";
import { formatClp } from "@/lib/clp";
import { parseCountedClp } from "@/lib/store-status";

const BLOCKER_COPY = {
  ACTIVE_POS_SALES: "Ventas POS sin cerrar",
  PENDING_PAYMENTS: "Pagos pendientes (no es dinero recibido)",
} as const;

function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `cash-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function Difference({ value }: { value: number }) {
  const tone = value === 0 ? "text-emerald-300" : value < 0 ? "text-red-300" : "text-amber-300";
  const label = value === 0 ? "Cuadra" : value < 0 ? "Faltante" : "Sobrante";
  return (
    <span className={tone}>
      {label} {value !== 0 && formatClp(Math.abs(value))}
    </span>
  );
}

function Tile({ label, value, hint, tone = "text-white" }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">{label}</p>
      <p className={["mt-1 text-xl font-black tabular-nums", tone].join(" ")}>{value}</p>
      {hint && <p className="text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}

function CloseReceipt({ close }: { close: CashCloseRecord }) {
  return (
    <div className="space-y-3 rounded-2xl border border-sky-400/25 bg-sky-400/[0.06] p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-sky-100">
        <Lock className="h-4 w-4" /> Caja {close.operationalDate} cerrada
      </p>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-neutral-400">Efectivo esperado</dt>
        <dd className="text-right tabular-nums">{formatClp(close.expectedCash)}</dd>
        <dt className="text-neutral-400">Efectivo contado</dt>
        <dd className="text-right tabular-nums">{formatClp(close.countedCash)}</dd>
        <dt className="text-neutral-400">Diferencia efectivo</dt>
        <dd className="text-right font-bold"><Difference value={close.cashDifference} /></dd>
        <dt className="text-neutral-400">Transferencias confirmadas</dt>
        <dd className="text-right tabular-nums">{formatClp(close.transfersConfirmed)}</dd>
        <dt className="text-neutral-400">Diferencia transferencias</dt>
        <dd className="text-right font-bold"><Difference value={close.transferDifference} /></dd>
      </dl>
      <p className="text-xs text-neutral-400">
        Por {close.closedBy.email ?? close.closedBy.uid} · {close.closedAtLocal}
        {close.override && <> · override: “{close.override.reason}”</>}
        {close.observation && <> · {close.observation}</>}
      </p>
    </div>
  );
}

export function CashPanel({ onClosed }: { onClosed: () => Promise<void> | void }) {
  const [day, setDay] = useState<CashCloseDay | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [counted, setCounted] = useState("");
  const [transfers, setTransfers] = useState("");
  const [observation, setObservation] = useState("");
  const [useOverride, setUseOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef(newIdempotencyKey());

  const load = useCallback(async () => {
    try {
      setDay(await fetchCashCloseDay());
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "No se pudo leer la caja.");
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  const countedParsed = counted.trim() ? parseCountedClp(counted) : null;
  const transfersParsed = transfers.trim() ? parseCountedClp(transfers) : null;
  const summary = day?.summary;
  const blocked = Boolean(summary?.blockers.length);
  const overrideValid = !blocked || (useOverride && overrideReason.trim().length >= 5);
  const canSubmit =
    !!summary && countedParsed?.ok === true && transfersParsed?.ok === true && overrideValid && !busy;

  async function submit() {
    if (!day || !countedParsed?.ok || !transfersParsed?.ok) return;
    setBusy(true);
    setError(null);
    try {
      await closeCashSessionApi({
        operationalDate: day.operationalDate,
        countedCash: countedParsed.value,
        transfersConfirmed: transfersParsed.value,
        observation: observation.trim(),
        overrideReason: blocked && useOverride ? overrideReason.trim() : undefined,
        idempotencyKey: idempotencyKey.current,
      });
      setConfirming(false);
      await Promise.all([load(), onClosed()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cerrar la caja.");
      if (err instanceof StoreApiError && err.code === "CASH_CLOSE_BLOCKED") await load();
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="cash-zone"
      className="rounded-3xl border border-sky-400/20 bg-[linear-gradient(180deg,rgba(56,189,248,0.06),rgba(16,16,16,0.9)_40%)] p-5 sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p id="cash-zone" className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-sky-300/80">
            <Wallet className="h-3.5 w-3.5" /> Caja · cierre financiero
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
            Jornada {day?.operationalDate ?? "…"}
          </h2>
          {day && (
            <p className="mt-1 text-xs text-neutral-500">
              {day.window.start.slice(11, 16)} → {day.window.end.slice(11, 16)} del día siguiente · {day.timezone}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-neutral-400 hover:bg-white/5 hover:text-white"
        >
          Actualizar
        </button>
      </div>

      <p className="mt-3 text-xs text-neutral-400">
        Separado de la tienda: cerrar la tienda no cuenta dinero. Cerrar caja registra el arqueo y deja la
        jornada cerrada (no se aceptan más pedidos de este día operacional).
      </p>

      {loadError && <p className="mt-4 text-sm text-red-300">{loadError}</p>}

      {summary && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Tile label="Efectivo esperado" value={formatClp(summary.expectedCash)} hint="Entregado en efectivo − gastos en efectivo" tone="text-sky-200" />
            <Tile label="Transferencias" value={formatClp(summary.expectedTransfers)} hint={`${summary.transferSales.count} ventas entregadas`} />
            <Tile label="Ventas efectivo" value={formatClp(summary.cashSales.total)} hint={`${summary.cashSales.count} entregadas`} />
            <Tile label="Gastos activos" value={formatClp(summary.activeExpenses.total)} hint={`${formatClp(summary.cashExpenses.total)} en efectivo`} />
            <Tile
              label="Ventas pendientes"
              value={formatClp(summary.pendingSales.total)}
              hint={`${summary.pendingSales.count} · no es dinero recibido`}
              tone={summary.pendingSales.count ? "text-amber-300" : "text-white"}
            />
            <Tile label="Pedidos del día" value={String(summary.ordersCount)} hint={`${summary.cancelledCount} cancelados excluidos`} />
          </div>

          {summary.blockers.length > 0 && (
            <ul className="mt-4 space-y-2">
              {summary.blockers.map((blocker) => (
                <li key={blocker.code} className="flex items-start gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <span className="font-bold">{BLOCKER_COPY[blocker.code]}:</span> {blocker.count} ({formatClp(blocker.total)}) ·{" "}
                    {blocker.displayCodes.map((code) => `#${code}`).join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {summary.activeOtherOrders.count > 0 && (
            <p className="mt-2 text-xs text-amber-300">
              {summary.activeOtherOrders.count} pedido(s) web aún en curso: su dinero no está en caja todavía.
            </p>
          )}
        </>
      )}

      {day?.close ? (
        <div className="mt-5">
          <CloseReceipt close={day.close} />
        </div>
      ) : summary ? (
        <div className="mt-5 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs text-neutral-400">
              Efectivo contado
              <input
                inputMode="numeric"
                value={counted}
                onChange={(event) => setCounted(event.target.value)}
                placeholder="Ej: 45.000"
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-lg font-bold tabular-nums text-white outline-none focus:border-sky-400/40"
              />
              {countedParsed && !countedParsed.ok && <span className="mt-1 block text-red-300">{countedParsed.message}</span>}
            </label>
            <label className="block text-xs text-neutral-400">
              Transferencias confirmadas
              <input
                inputMode="numeric"
                value={transfers}
                onChange={(event) => setTransfers(event.target.value)}
                placeholder="Verificadas en el banco"
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-lg font-bold tabular-nums text-white outline-none focus:border-sky-400/40"
              />
              {transfersParsed && !transfersParsed.ok && <span className="mt-1 block text-red-300">{transfersParsed.message}</span>}
            </label>
          </div>

          {countedParsed?.ok && (
            <p className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base font-bold">
              Diferencia efectivo: <Difference value={countedParsed.value - summary.expectedCash} />
              {transfersParsed?.ok && (
                <span className="ml-4 text-sm font-semibold">
                  Transferencias: <Difference value={transfersParsed.value - summary.expectedTransfers} />
                </span>
              )}
            </p>
          )}

          <label className="block text-xs text-neutral-400">
            Observación
            <input
              value={observation}
              onChange={(event) => setObservation(event.target.value)}
              maxLength={500}
              placeholder="Ej: faltan monedas de $100"
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400/40"
            />
          </label>

          {blocked && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-4">
              <label className="flex items-center gap-2 text-sm font-semibold text-red-100">
                <input type="checkbox" checked={useOverride} onChange={(event) => setUseOverride(event.target.checked)} />
                Cerrar igual con override administrativo (queda auditado)
              </label>
              {useOverride && (
                <input
                  value={overrideReason}
                  onChange={(event) => setOverrideReason(event.target.value)}
                  maxLength={280}
                  placeholder="Motivo obligatorio (mín. 5 caracteres)"
                  className="mt-2 w-full rounded-xl border border-red-500/30 bg-black/30 px-3 py-2.5 text-sm text-white outline-none"
                />
              )}
            </div>
          )}

          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}

          {!confirming ? (
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => setConfirming(true)}
              className="min-h-14 w-full rounded-2xl border border-sky-400/40 bg-sky-400/15 text-base font-bold text-sky-100 hover:bg-sky-400/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Cerrar caja
            </button>
          ) : (
            <div className="space-y-2 rounded-2xl border border-sky-400/30 bg-black/40 p-4">
              <p className="text-sm text-neutral-200">
                Se registra el arqueo de {day?.operationalDate} y la jornada queda cerrada: no se aceptan más pedidos
                web ni POS hasta el próximo día operacional. No se puede deshacer.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={submit}
                  className="min-h-12 flex-1 rounded-xl border border-sky-400/40 bg-sky-400/20 text-sm font-bold text-sky-50 disabled:opacity-50"
                >
                  {busy ? "Cerrando…" : "Confirmar cierre de caja"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                  className="min-h-12 rounded-xl border border-white/10 px-4 text-sm text-neutral-300"
                >
                  Volver
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
