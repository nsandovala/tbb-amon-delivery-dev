"use client";

import { useState } from "react";
import type { StoreEvent } from "@/lib/api/store";
import { formatLocalDateTime, STORE_EVENT_LABELS, STORE_STATE_LABELS } from "@/lib/store-status";

const INITIAL_VISIBLE = 5;

export function AuditLog({ events }: { events: StoreEvent[] }) {
  const [expanded, setExpanded] = useState(false);
  const visibleEvents = expanded ? events : events.slice(0, INITIAL_VISIBLE);
  const canExpand = events.length > INITIAL_VISIBLE;

  return (
    <section aria-labelledby="operation-audit-title" className="ops-surface rounded-md border border-white/10 bg-[#101010] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Registro de actividad</p>
          <h2 id="operation-audit-title" className="ops-text mt-1 text-base font-semibold text-white">Bitácora</h2>
          <p className="ops-muted mt-1 text-xs text-neutral-400">Movimientos de tienda y caja · últimos {events.length} disponibles</p>
        </div>
        <span className="ops-badge rounded-sm border border-white/10 px-2 py-1 text-[10px] text-neutral-400">
          {events.length} {events.length === 1 ? "movimiento" : "movimientos"}
        </span>
      </div>

      {events.length === 0 ? (
        <p className="ops-muted mt-4 border-t border-white/10 pt-3 text-sm text-neutral-500">Aún no hay movimientos registrados.</p>
      ) : (
        <ol className="mt-3 divide-y divide-white/10 border-t border-white/10">
          {visibleEvents.map((event) => (
            <li key={event.id} className="py-3">
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
          ))}
        </ol>
      )}

      {canExpand && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 border-t border-white/10 pt-3 text-left text-xs font-medium text-emerald-300 hover:text-emerald-200"
        >
          {expanded ? "Mostrar menos ↑" : `Ver ${events.length - INITIAL_VISIBLE} movimientos anteriores ↓`}
        </button>
      )}
    </section>
  );
}
