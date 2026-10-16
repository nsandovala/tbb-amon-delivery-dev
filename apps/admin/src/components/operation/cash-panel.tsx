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
import { formatLocalDateTime, formatOperationalDate, parseCountedClp } from "@/lib/store-status";

const BLOCKER_COPY = {
  ACTIVE_POS_SALES: "Ventas POS sin cerrar",
  ACTIVE_OTHER_ORDERS: "Pedidos web/WhatsApp activos",
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
    <div className="ops-subtle rounded-sm border border-white/10 bg-black/30 px-3 py-2">
      <p className="ops-muted text-[9px] uppercase tracking-[0.12em] text-neutral-500">{label}</p>
      <p className={["ops-text mt-1 text-base font-bold tabular-nums", tone].join(" ")}>{value}</p>
      {hint && <p className="ops-muted text-[10px] text-neutral-500">{hint}</p>}
    </div>
  );
}

function CloseReceipt({ close }: { close: CashCloseRecord }) {
  return (
    <div className="ops-surface space-y-3 rounded-sm border border-sky-400/25 bg-sky-400/[0.06] p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-sky-100">
        <Lock className="h-4 w-4" /> Caja {formatOperationalDate(close.operationalDate)} cerrada
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
        Por {close.closedBy.email ?? close.closedBy.uid} · {formatLocalDateTime(close.closedAtLocal)}
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
    <section aria-labelledby="cash-zone" className="ops-surface rounded-md border border-white/10 bg-[#101010] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p id="cash-zone" className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-sky-300/80">
            <Wallet className="h-3.5 w-3.5" /> Caja · cierre financiero
          </p>
          <h2 className="ops-text mt-1 text-base font-semibold text-white">
            Jornada {formatOperationalDate(day?.operationalDate)}
          </h2>
          {day && (
            <p className="ops-muted mt-1 text-[10px] text-neutral-500">
              {day.window.start.slice(11, 16)} → {day.window.end.slice(11, 16)} del día siguiente · {day.timezone}
            </p>
          )}
        </div>
        <span className={day?.close ? "rounded-sm border border-sky-400/25 bg-sky-400/10 px-2 py-1 text-[9px] text-sky-200" : "rounded-sm border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-[9px] text-amber-200"}>
          {day?.close ? "Cerrada" : "En curso"}
        </span>
        <button
          type="button"
          onClick={() => void load()}
          aria-label="Actualizar resumen de caja"
          className="rounded-sm border border-white/10 px-2 py-1 text-[10px] text-neutral-400 hover:bg-white/5 hover:text-white"
        >
          ↻
        </button>
      </div>

      <p className="ops-muted mt-3 text-[10px] text-neutral-400">
        Separado de la tienda: cerrar la tienda no cuenta dinero. Cerrar caja registra el arqueo y deja la
        jornada cerrada (no se aceptan más pedidos de este día operacional).
      </p>

      {loadError && <p className="mt-4 text-sm text-red-300">{loadError}</p>}

      <details className="mt-3 border-t border-white/10 pt-3">
      <summary className="ops-text flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-white marker:hidden">
        <span>{day?.close ? "Ver comprobante de cierre" : "Revisar resumen y preparar cierre"}</span>
        {summary && <span className="ops-muted text-right text-[10px] font-normal text-neutral-400">{summary.blockers.length > 0 ? `${summary.blockers.length} bloqueo(s)` : `${formatClp(summary.expectedCash)} esperado`}</span>}
      </summary>
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
                <li key={blocker.code} className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
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
                className="ops-input mt-1 w-full rounded-sm border border-white/10 bg-white/5 px-3 py-2 text-base font-bold tabular-nums text-white outline-none focus:border-sky-400/40"
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
                className="ops-input mt-1 w-full rounded-sm border border-white/10 bg-white/5 px-3 py-2 text-base font-bold tabular-nums text-white outline-none focus:border-sky-400/40"
              />
              {transfersParsed && !transfersParsed.ok && <span className="mt-1 block text-red-300">{transfersParsed.message}</span>}
            </label>
          </div>

          {countedParsed?.ok && (
            <p className="ops-subtle rounded-sm border border-white/10 bg-black/30 px-3 py-2 text-sm font-bold">
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
              className="ops-input mt-1 w-full rounded-sm border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-sky-400/40"
            />
          </label>

          {blocked && (
            <div className="rounded-md border border-red-500/30 bg-red-500/[0.06] p-4">
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
                  className="mt-2 w-full rounded-md border border-red-500/30 bg-black/30 px-3 py-2.5 text-sm text-white outline-none"
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
              className="min-h-14 w-full rounded-md border border-sky-400/40 bg-sky-400/15 text-base font-bold text-sky-100 hover:bg-sky-400/25 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Cerrar caja
            </button>
          ) : (
            <div className="space-y-2 rounded-md border border-sky-400/30 bg-black/40 p-4">
              <p className="ops-muted text-xs text-neutral-200">
                Se registra el arqueo de {formatOperationalDate(day?.operationalDate)} y la jornada queda cerrada: no se aceptan más pedidos
                web ni POS hasta el próximo día operacional. No se puede deshacer.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={submit}
                  className="min-h-12 flex-1 rounded-md border border-sky-400/40 bg-sky-400/20 text-sm font-bold text-sky-50 disabled:opacity-50"
                >
                  {busy ? "Cerrando…" : "Confirmar cierre de caja"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                  className="min-h-12 rounded-md border border-white/10 px-4 text-sm text-neutral-300"
                >
                  Volver
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
      </details>
    </section>
  );
}
