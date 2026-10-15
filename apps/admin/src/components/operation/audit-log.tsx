"use client";

import type { StoreEvent } from "@/lib/api/store";
import { STORE_EVENT_LABELS, STORE_STATE_LABELS } from "@/lib/store-status";

function formatLocal(atLocal: string): string {
  // atLocal = "YYYY-MM-DDTHH:MM:SS±HH:MM" ya en hora de la tienda.
  return `${atLocal.slice(8, 10)}-${atLocal.slice(5, 7)} ${atLocal.slice(11, 16)}`;
}

export function AuditLog({ events }: { events: StoreEvent[] }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-[#101010] p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-neutral-500">Bitácora (solo lectura)</p>
      {events.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">Sin eventos registrados.</p>
      ) : (
        <ol className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
          {events.map((event) => (
            <li key={event.id} className="rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs tabular-nums text-neutral-500">{formatLocal(event.atLocal)}</span>
                <span className="font-semibold text-white">{STORE_EVENT_LABELS[event.type] ?? event.type}</span>
                <span
                  className={[
                    "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                    event.source === "manual" ? "bg-amber-400/15 text-amber-200" : "bg-white/10 text-neutral-300",
                  ].join(" ")}
                >
                  {event.source === "manual" ? "Manual" : "Horario"}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-400">
                {event.previousState ? STORE_STATE_LABELS[event.previousState] : "—"} →{" "}
                {STORE_STATE_LABELS[event.newState] ?? event.newState}
                {event.actor && <> · {event.actor.email ?? event.actor.uid}</>}
                {event.reason && <> · “{event.reason}”</>}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
