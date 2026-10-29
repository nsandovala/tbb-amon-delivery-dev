"use client";

import { useMemo, useState } from "react";
import type { StoreEvent } from "@/lib/api/store";
import { useOrderCodes } from "@/hooks/use-order-codes";
import type { LiveQueryView } from "@/lib/payment-presentation";
import {
  buildOperationTimeline,
  formatSignedClp,
  PAYMENT_EVENT_LABELS,
  paymentActorLabel,
  type TimelinePaymentEvent,
} from "@/lib/operation-timeline";
import { formatLocalDateTime, STORE_EVENT_LABELS, STORE_STATE_LABELS } from "@/lib/store-status";

const INITIAL_VISIBLE = 5;

/**
 * Bitácora de Operación. Con `payments` (solo roles con `payments.view`,
 * FIN-QA-02) intercala confirmaciones y reversiones del libro de pagos con los
 * movimientos de tienda y caja. Con `payments = null` es la bitácora previa.
 */
export function AuditLog({
  tenantId,
  events,
  payments,
}: {
  tenantId: string;
  events: StoreEvent[];
  payments: LiveQueryView<TimelinePaymentEvent[]> | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const timeline = useMemo(() => buildOperationTimeline(events, payments), [events, payments]);
  const visibleEntries = expanded ? timeline.entries : timeline.entries.slice(0, INITIAL_VISIBLE);
  const movementCount = timeline.entries.filter((entry) => entry.kind !== "payments_gap").length;
  const canExpand = timeline.entries.length > INITIAL_VISIBLE;
  const hiddenCount = timeline.entries.slice(INITIAL_VISIBLE).filter((entry) => entry.kind !== "payments_gap").length;
  const visibleOrderIds = visibleEntries.flatMap((entry) => (entry.kind === "payment" ? [entry.event.orderId] : []));
  const orderCodes = useOrderCodes(tenantId, visibleOrderIds);

  return (
    <section aria-labelledby="operation-audit-title" className="ops-surface rounded-md border border-white/10 bg-[#101010] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Registro de actividad</p>
          <h2 id="operation-audit-title" className="ops-text mt-1 text-base font-semibold text-white">Bitácora</h2>
          <p className="ops-muted mt-1 text-xs text-neutral-400">
            {payments
              ? `Movimientos de tienda y caja (últimos ${events.length}) y pagos de transferencia (últimos ${timeline.paymentCount})`
              : `Movimientos de tienda y caja · últimos ${events.length} disponibles`}
          </p>
        </div>
        <span className="ops-badge rounded-sm border border-white/10 px-2 py-1 text-[10px] text-neutral-400">
          {movementCount} {movementCount === 1 ? "movimiento" : "movimientos"}
        </span>
      </div>

      {timeline.paymentNotice && (
        <p role="status" className="mt-3 rounded-sm border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200">
          {timeline.paymentNotice}
        </p>
      )}

      {movementCount === 0 ? (
        <p className="ops-muted mt-4 border-t border-white/10 pt-3 text-sm text-neutral-500">Aún no hay movimientos registrados.</p>
      ) : (
        <ol className="mt-3 divide-y divide-white/10 border-t border-white/10">
          {visibleEntries.map((entry) => {
            if (entry.kind === "payments_gap") {
              return (
                <li key={entry.key} className="py-2 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                  Más atrás: sin pagos cargados
                </li>
              );
            }
            if (entry.kind === "payment") {
              const event = entry.event;
              const code = orderCodes.get(event.orderId);
              return (
                <li key={entry.key} className="py-3">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <time className="ops-muted font-mono text-[10px] tabular-nums text-neutral-500" dateTime={event.atLocal ?? undefined}>
                      {formatLocalDateTime(event.atLocal)}
                    </time>
                    <span className="ops-text text-xs font-semibold text-white">{PAYMENT_EVENT_LABELS[event.type]}</span>
                    <span className="rounded-sm bg-sky-400/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sky-200">
                      Pago
                    </span>
                  </div>
                  <p className="ops-muted mt-1 text-[11px] leading-5 text-neutral-400">
                    {code ? (code === "S/C" ? "Pedido sin correlativo" : `Pedido #${code}`) : "Pedido…"}
                    {" · "}
                    <span className={event.signedAmount < 0 ? "text-red-300" : "text-emerald-300"}>{formatSignedClp(event.signedAmount)}</span>
                    {" · "}
                    {paymentActorLabel(event.actor)}
                  </p>
                </li>
              );
            }
            const event = entry.event;
            return (
              <li key={entry.key} className="py-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <time className="ops-muted font-mono text-[10px] tabular-nums text-neutral-500" dateTime={event.atLocal}>
                    {formatLocalDateTime(event.atLocal)}
                  </time>
                  <span className="ops-text text-xs font-semibold text-white">{STORE_EVENT_LABELS[event.type] ?? event.type}</span>
                  <span className={[
                    "rounded-sm px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                    event.source === "manual" ? "bg-amber-400/15 text-amber-200" : "bg-white/10 text-neutral-300",
                  ].join(" ")}>
                    {event.source === "manual" ? "Manual" : "Horario"}
                  </span>
                </div>
                <p className="ops-muted mt-1 text-[11px] leading-5 text-neutral-400">
                  {event.previousState ? STORE_STATE_LABELS[event.previousState] : "—"} → {STORE_STATE_LABELS[event.newState] ?? event.newState}
                  {event.actor && <> · {event.actor.email ?? event.actor.uid}</>}
                  {event.reason && <> · “{event.reason}”</>}
                </p>
              </li>
            );
          })}
        </ol>
      )}

      {canExpand && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 border-t border-white/10 pt-3 text-left text-xs font-medium text-emerald-300 hover:text-emerald-200"
        >
          {expanded ? "Mostrar menos ↑" : `Ver ${hiddenCount} movimientos anteriores ↓`}
        </button>
      )}
    </section>
  );
}
