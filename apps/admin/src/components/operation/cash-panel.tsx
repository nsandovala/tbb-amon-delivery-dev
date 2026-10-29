"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Lock, Wallet } from "lucide-react";
import {
  closeCashSessionApi,
  fetchCashCloseDay,
  StoreApiError,
  type CashCloseDay,
  type CashCloseDeclarationDetails,
  type CashCloseRecord,
} from "@/lib/api/store";
import { formatClp } from "@/lib/clp";
import { formatLocalDateTime, formatOperationalDate, parseCountedClp } from "@/lib/store-status";
import { useActiveTenant } from "@/components/tenant-provider";
import { reconcilableNet, transferReconciliationDifference } from "@/lib/payment-presentation";
import {
  cashCloseReadiness,
  differenceLabel,
  DISCREPANCY_REASON_MIN,
  OVERRIDE_REASON_MIN,
  transferDifferenceRows,
  type DifferenceKind,
} from "@/lib/cash-close-presentation";

const BLOCKER_COPY = {
  ACTIVE_POS_SALES: "Ventas POS sin cerrar",
  ACTIVE_OTHER_ORDERS: "Pedidos web/WhatsApp activos",
  PENDING_PAYMENTS: "Pagos pendientes (no es dinero recibido)",
  UNCONFIRMED_TRANSFERS: "Transferencias sin confirmar (confírmalas en Pedidos o POS)",
} as const;

/** FIN-CLOSE-01: rechazos que traen las cifras recalculadas por el servidor. */
const DECLARATION_ERRORS = new Set([
  "CASH_DIFFERENCE_REASON_REQUIRED",
  "CASH_CLOSE_DIFFERENCE_STALE",
  "CASH_CLOSE_LEDGER_SUGGESTION_STALE",
]);

function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `cash-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function Difference({ value, kind = "financial" }: { value: number; kind?: DifferenceKind }) {
  const tone = kind === "operational"
    ? "text-neutral-300"
    : value === 0 ? "text-emerald-300" : value < 0 ? "text-red-300" : "text-amber-300";
  const separator = kind === "operational" ? "" : " ";
  return (
    <span className={tone}>
      {differenceLabel(value, kind)}{value !== 0 && `${separator}${formatClp(Math.abs(value))}`}
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
  const fromLedger = close.transfersEntryMode === "ledger_suggestion";
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
        <dt className="text-neutral-400">
          Transferencias declaradas
          <span className="block text-[10px] text-neutral-500">
            {fromLedger ? "Copiadas del libro · contraste bancario confirmado por el operador" : "Verificadas en el banco"}
          </span>
        </dt>
        <dd className="text-right tabular-nums">{formatClp(close.transfersConfirmed)}</dd>
        {close.collectionDifference !== undefined && (
          <>
            <dt className="text-neutral-400">Cobros confirmados en sistema</dt>
            <dd className="text-right tabular-nums">{formatClp(close.systemConfirmedTransfers ?? 0)}</dd>
          </>
        )}
        {transferDifferenceRows(close).map((row) => (
          <div key={row.id} className="contents">
            <dt className="text-neutral-400">
              {row.label}
              <span className="block text-[10px] text-neutral-500">{row.hint}</span>
            </dt>
            <dd className={["text-right", row.kind === "financial" ? "font-bold" : "font-medium"].join(" ")}>
              <Difference value={row.value} kind={row.kind} />
            </dd>
          </div>
        ))}
      </dl>
      {close.discrepancy && (
        <p className="rounded-sm border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2 text-xs text-amber-200">
          Cerrada con diferencia justificada: “{close.discrepancy.reason}”
        </p>
      )}
      <p className="text-xs text-neutral-400">
        Por {close.closedBy.email ?? close.closedBy.uid} · {formatLocalDateTime(close.closedAtLocal)}
        {close.override && <> · override: “{close.override.reason}”</>}
        {close.observation && <> · {close.observation}</>}
      </p>
    </div>
  );
}

function ClpField({
  id,
  label,
  hint,
  value,
  onChange,
  placeholder,
  parsed,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  parsed: ReturnType<typeof parseCountedClp> | null;
}) {
  return (
    <div className="text-xs text-neutral-400">
      <label htmlFor={id} className="block">
        {label} <span className="text-neutral-500">(CLP, sin decimales)</span>
      </label>
      <div className="ops-input mt-1 flex items-center rounded-sm border border-white/10 bg-white/5 focus-within:border-sky-400/40">
        <span aria-hidden="true" className="pl-3 text-base font-bold text-neutral-500">$</span>
        <input
          id={id}
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-describedby={`${id}-hint`}
          aria-invalid={parsed?.ok === false || undefined}
          className="w-full bg-transparent px-2 py-2 text-base font-bold tabular-nums text-white outline-none"
        />
      </div>
      <span id={`${id}-hint`} className="mt-1 block text-[10px] text-neutral-500">
        {parsed?.ok ? `= ${formatClp(parsed.value)}` : hint}
      </span>
      {parsed && !parsed.ok && <span role="alert" className="mt-1 block text-red-300">{parsed.message}</span>}
    </div>
  );
}

export function CashPanel({ onClosed }: { onClosed: () => Promise<void> | void }) {
  const { tenantId } = useActiveTenant();
  const [day, setDay] = useState<CashCloseDay | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [counted, setCounted] = useState("");
  const [transfers, setTransfers] = useState("");
  const [observation, setObservation] = useState("");
  const [useOverride, setUseOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [discrepancyReason, setDiscrepancyReason] = useState("");
  // La aceptación vale solo para las cifras que el operador vio: si cambian, se pierde.
  const [acknowledgedKey, setAcknowledgedKey] = useState<string | null>(null);
  // D3: importe copiado del libro (sugerencia) y contraste bancario declarado para ESE importe.
  const [suggestion, setSuggestion] = useState<number | null>(null);
  const [bankVerified, setBankVerified] = useState(false);
  const [serverFigures, setServerFigures] = useState<CashCloseDeclarationDetails | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef(newIdempotencyKey());

  const load = useCallback(async () => {
    try {
      setDay(await fetchCashCloseDay(tenantId));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "No se pudo leer la caja.");
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  const countedParsed = counted.trim() ? parseCountedClp(counted) : null;
  const transfersParsed = transfers.trim() ? parseCountedClp(transfers) : null;
  const summary = day?.summary ?? undefined;
  const collections = summary?.transferCollections;
  const ledgerNet = reconcilableNet(collections);
  const blocked = Boolean(summary?.blockers.length);
  const differences = summary && countedParsed?.ok && transfersParsed?.ok
    ? {
      // Misma regla que computeCashDifferences en el servidor.
      cashDifference: countedParsed.value - summary.expectedCash,
      collectionDifference: transfersParsed.value - (collections?.net ?? 0),
    }
    : null;
  const differencesKey = differences ? `${differences.cashDifference}|${differences.collectionDifference}` : null;
  const discrepancyAcknowledged = differencesKey !== null && acknowledgedKey === differencesKey;
  const readiness = cashCloseReadiness({
    hasSummary: Boolean(summary),
    summaryStale: Boolean(loadError && day),
    ledgerConsistent: day?.ledger ? day.ledger.consistent : null,
    collectionsComplete: collections ? collections.complete : true,
    blockers: summary?.blockers ?? [],
    counted: countedParsed,
    transfers: transfersParsed,
    useOverride,
    overrideReason,
    differences,
    discrepancyReason,
    discrepancyAcknowledged,
    ledgerSuggestionActive: suggestion !== null,
    bankVerified,
    busy,
  });
  const unknownOrigin = collections?.unknownOrigin;

  // Si una recarga cambia las cifras mientras se confirma, se vuelve al formulario.
  useEffect(() => {
    if (confirming && !busy && !readiness.canSubmit) setConfirming(false);
  }, [confirming, busy, readiness.canSubmit]);

  function editTransfers(value: string) {
    // Editar a mano descarta la sugerencia: el importe pasa a ser declaración manual.
    setTransfers(value);
    setSuggestion(null);
    setBankVerified(false);
  }

  function applyLedgerSuggestion() {
    if (ledgerNet === null || ledgerNet < 0) return;
    setTransfers(ledgerNet.toLocaleString("es-CL"));
    setSuggestion(ledgerNet);
    setBankVerified(false);
  }

  async function submit() {
    if (!day || !countedParsed?.ok || !transfersParsed?.ok || !readiness.canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await closeCashSessionApi(tenantId, {
        operationalDate: day.operationalDate,
        countedCash: countedParsed.value,
        transfersConfirmed: transfersParsed.value,
        observation: observation.trim(),
        overrideReason: blocked && useOverride ? overrideReason.trim() : undefined,
        discrepancy: readiness.needsDiscrepancy && differences
          ? { reason: discrepancyReason.trim(), ...differences }
          : undefined,
        ledgerSuggestion: suggestion !== null && bankVerified
          ? { suggestedAmount: suggestion, bankVerified: true }
          : undefined,
        idempotencyKey: idempotencyKey.current,
      });
      setConfirming(false);
      setServerFigures(null);
      await Promise.all([load(), onClosed()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cerrar la caja.");
      if (err instanceof StoreApiError && DECLARATION_ERRORS.has(err.code)) {
        // FIN-CLOSE-01: cifras reales del servidor; la aceptación previa queda sin efecto.
        setServerFigures((err.details ?? null) as CashCloseDeclarationDetails | null);
        setAcknowledgedKey(null);
        if (err.code === "CASH_CLOSE_LEDGER_SUGGESTION_STALE") {
          setTransfers("");
          setSuggestion(null);
          setBankVerified(false);
        }
        await load();
      } else if (err instanceof StoreApiError && err.code === "CASH_CLOSE_BLOCKED") {
        await load();
      }
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

      <details className="ops-divider mt-3 border-t pt-3">
      <summary className="ops-text flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-white marker:hidden">
        <span>{day?.close ? "Ver comprobante de cierre" : "Revisar resumen y preparar cierre"}</span>
        {summary && <span className="ops-muted text-right text-[10px] font-normal text-neutral-400">{summary.blockers.length > 0 ? `${summary.blockers.length} bloqueo(s)` : `${formatClp(summary.expectedCash)} esperado`}</span>}
      </summary>
      {summary && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Tile label="Efectivo esperado" value={formatClp(summary.expectedCash)} hint="Entregado en efectivo − gastos en efectivo" tone="text-sky-200" />
            <Tile label="Transferencias entregadas" value={formatClp(summary.expectedTransfers)} hint={`${summary.transferSales.count} ventas entregadas · confirmadas o no · referencia operacional`} />
            <Tile label="Ventas efectivo" value={formatClp(summary.cashSales.total)} hint={`${summary.cashSales.count} entregadas`} />
            <Tile label="Gastos activos" value={formatClp(summary.activeExpenses.total)} hint={`${formatClp(summary.cashExpenses.total)} en efectivo`} />
            <Tile
              label="Ventas pendientes"
              value={formatClp(summary.pendingSales.total)}
              hint={`${summary.pendingSales.count} · no es dinero recibido`}
              tone={summary.pendingSales.count ? "text-amber-300" : "text-white"}
            />
            <Tile label="Pedidos del día" value={String(summary.ordersCount)} hint={`${summary.cancelledCount} cancelados excluidos`} />
            {collections && (
              <Tile
                label="Cobros transferencia confirmados"
                value={ledgerNet === null ? "Incompleto" : formatClp(collections.net)}
                hint={collections.complete
                  ? `${collections.confirmed.count} de la jornada · ${collections.late.count} tardíos${unknownOrigin ? ` · ${unknownOrigin.count} origen desconocido` : ""} · ${collections.reverted.count} reversos · base de conciliación`
                  : "Más eventos que el tope verificable: no es un total conciliado"}
                tone={collections.complete ? "text-emerald-200" : "text-red-300"}
              />
            )}
            {summary.transferUnconfirmedSales && (
              <Tile
                label="Transferencias sin confirmar"
                value={formatClp(summary.transferUnconfirmedSales.total)}
                hint={`${summary.transferUnconfirmedSales.count} entregadas · no es dinero verificado`}
                tone={summary.transferUnconfirmedSales.count ? "text-amber-300" : "text-white"}
              />
            )}
          </div>

          {unknownOrigin && unknownOrigin.count > 0 && (
            <p className="mt-2 text-xs text-amber-300">
              {unknownOrigin.count} confirmación(es) ({formatClp(unknownOrigin.total)}) de pedidos sin jornada de origen
              registrada: suman al cobro neto, pero no se clasifican como de esta jornada. Revísalas en la bitácora.
            </p>
          )}
          {summary.cancelledPaidTransfers && summary.cancelledPaidTransfers.count > 0 && (
            <p className="mt-2 text-xs text-red-300">
              {summary.cancelledPaidTransfers.count} pedido(s) cancelado(s) con transferencia confirmada
              ({formatClp(summary.cancelledPaidTransfers.total)}): reembolso por revisar. No suman como venta.
            </p>
          )}
          {day?.ledger && !day.ledger.consistent && (
            <p role="alert" className="mt-2 text-xs text-red-300">
              El libro de pagos no coincide con su contador de jornada. El cierre quedará bloqueado hasta revisarlo.
            </p>
          )}
          {day?.summarySource === "snapshot" && (
            <p className="mt-2 text-[10px] text-neutral-500">Cifras del cierre registrado (inmutables).</p>
          )}

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
            <ClpField
              id="cash-counted"
              label="Efectivo contado"
              hint="Total contado en caja. Escribe 0 si no hubo efectivo."
              value={counted}
              onChange={setCounted}
              placeholder="45.000"
              parsed={countedParsed}
            />
            <div>
              <ClpField
                id="cash-transfers"
                label="Transferencias verificadas en el banco"
                hint="Lo acreditado en la cuenta bancaria. Escribe 0 si no hubo."
                value={transfers}
                onChange={editTransfers}
                placeholder="0"
                parsed={transfersParsed}
              />
              {ledgerNet !== null && ledgerNet >= 0 && (
                <button
                  type="button"
                  onClick={applyLedgerSuggestion}
                  className="mt-2 rounded-sm border border-white/10 px-2 py-1 text-[11px] text-sky-200 hover:bg-white/5"
                >
                  Usar cobros del libro como sugerencia ({formatClp(ledgerNet)})
                </button>
              )}
              {suggestion !== null && (
                <label className="mt-2 flex items-start gap-2 rounded-sm border border-amber-400/25 bg-amber-400/[0.06] p-2 text-[11px] text-amber-100">
                  <input
                    type="checkbox"
                    checked={bankVerified}
                    onChange={(event) => setBankVerified(event.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    Contrasté {formatClp(suggestion)} con el banco. El libro de pagos registra lo confirmado en AMON;
                    no reemplaza la verificación bancaria.
                  </span>
                </label>
              )}
            </div>
          </div>

          {countedParsed?.ok && (
            <p className="ops-subtle rounded-sm border border-white/10 bg-black/30 px-3 py-2 text-sm font-bold">
              Diferencia efectivo: <Difference value={countedParsed.value - summary.expectedCash} />
              {transfersParsed?.ok && (
                <span className="ml-4 text-sm font-semibold">
                  Conciliación con libro de pagos:{" "}
                  {(() => {
                    // FIN-A01: sin libro completo no hay base para conciliar.
                    const difference = transferReconciliationDifference(
                      transfersParsed.value,
                      collections,
                      summary.expectedTransfers
                    );
                    return difference === null
                      ? <span className="text-red-300">no conciliable (libro de pagos incompleto)</span>
                      : <Difference value={difference} />;
                  })()}
                </span>
              )}
            </p>
          )}

          {serverFigures && (
            <div role="alert" className="rounded-md border border-amber-400/30 bg-amber-400/[0.08] p-3 text-xs text-amber-100">
              <p className="font-semibold">Cifras recalculadas por el servidor. Revísalas antes de volver a confirmar:</p>
              <p className="mt-1 tabular-nums">
                Efectivo esperado {formatClp(serverFigures.expectedCash)} · diferencia efectivo{" "}
                <Difference value={serverFigures.cashDifference} /> · cobros confirmados{" "}
                {formatClp(serverFigures.systemConfirmedTransfers)} · conciliación{" "}
                <Difference value={serverFigures.collectionDifference} />
              </p>
            </div>
          )}

          {readiness.needsDiscrepancy && differences && (
            <div className="space-y-2 rounded-md border border-amber-400/30 bg-amber-400/[0.06] p-4">
              <p className="text-sm font-semibold text-amber-100">El arqueo tiene diferencias financieras</p>
              <ul className="text-xs text-amber-100">
                {differences.cashDifference !== 0 && (
                  <li>Efectivo: <Difference value={differences.cashDifference} /></li>
                )}
                {differences.collectionDifference !== 0 && (
                  <li>Conciliación con libro de pagos: <Difference value={differences.collectionDifference} /></li>
                )}
              </ul>
              <label htmlFor="cash-discrepancy-reason" className="block text-xs text-neutral-300">
                Motivo de la diferencia (obligatorio, mín. {DISCREPANCY_REASON_MIN} caracteres)
              </label>
              <textarea
                id="cash-discrepancy-reason"
                value={discrepancyReason}
                onChange={(event) => setDiscrepancyReason(event.target.value)}
                maxLength={280}
                rows={2}
                placeholder="Ej: vuelto mal entregado en pedido #012"
                className="ops-input w-full rounded-sm border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-amber-400/40"
              />
              <label className="flex items-start gap-2 text-xs text-amber-100">
                <input
                  type="checkbox"
                  checked={discrepancyAcknowledged}
                  onChange={(event) => setAcknowledgedKey(event.target.checked ? differencesKey : null)}
                  className="mt-0.5"
                />
                Confirmo cerrar la caja con estas diferencias. Quedan registradas con mi usuario y el motivo.
              </label>
            </div>
          )}

          <label className="block text-xs text-neutral-400">
            Observación (opcional)
            <input
              value={observation}
              onChange={(event) => setObservation(event.target.value)}
              maxLength={500}
              placeholder="Ej: faltan monedas de $100"
              className="ops-input mt-1 w-full rounded-sm border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-sky-400/40"
            />
          </label>

          {blocked && readiness.overrideAllowed && (
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
                  aria-label="Motivo del override"
                  placeholder={`Motivo obligatorio (mín. ${OVERRIDE_REASON_MIN} caracteres)`}
                  className="mt-2 w-full rounded-md border border-red-500/30 bg-black/30 px-3 py-2.5 text-sm text-white outline-none"
                />
              )}
            </div>
          )}

          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}

          {!confirming ? (
            <>
              <button
                type="button"
                disabled={!readiness.canSubmit}
                aria-describedby={readiness.reasons.length ? "cash-close-reasons" : undefined}
                onClick={() => setConfirming(true)}
                className="min-h-14 w-full rounded-md border border-sky-400/40 bg-sky-400/15 text-base font-bold text-sky-100 hover:bg-sky-400/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Cerrar caja
              </button>
              {readiness.reasons.length > 0 && (
                <div id="cash-close-reasons" aria-live="polite" className="text-xs text-neutral-400">
                  <p className="font-semibold text-neutral-300">Para cerrar falta:</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {readiness.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-2 rounded-md border border-sky-400/30 bg-black/40 p-4">
              <p className="ops-muted text-xs text-neutral-200">
                Se registra el arqueo de {formatOperationalDate(day?.operationalDate)} y la jornada queda cerrada: no se aceptan más pedidos
                web ni POS hasta el próximo día operacional. No se puede deshacer.
              </p>
              {differences && (
                <ul className="text-xs text-neutral-300">
                  <li>Diferencia efectivo: <Difference value={differences.cashDifference} /></li>
                  <li>Conciliación con libro de pagos: <Difference value={differences.collectionDifference} /></li>
                  <li>
                    Transferencias: {suggestion !== null ? "copiadas del libro y contrastadas con el banco por ti" : "declaradas a mano desde el banco"}
                  </li>
                  {readiness.needsDiscrepancy && <li>Motivo: “{discrepancyReason.trim()}”</li>}
                </ul>
              )}
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
