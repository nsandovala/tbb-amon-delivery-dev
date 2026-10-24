"use client";

import Link from "next/link";
import { useCallback } from "react";
import { fetchStoreStatus } from "@/lib/api/store";
import { usePolledStoreStatus } from "@/hooks/use-store-status";
import { useActiveTenant } from "@/components/tenant-provider";
import {
  formatCountdown,
  formatStoreClock,
  formatStoreTime,
  getNextTransition,
  getStoreTone,
  STORE_STATE_LABELS,
  TONE_CLASSES,
} from "@/lib/store-status";

/**
 * M6J — franja de estado de tienda para POS y cocina: legible a distancia.
 * Solo lectura; las acciones viven en /operacion.
 */
export function StoreStatusStrip() {
  const { tenantId } = useActiveTenant();
  const load = useCallback(() => fetchStoreStatus(tenantId), [tenantId]);
  const { data: status, error, nowMs } = usePolledStoreStatus(load);

  if (!status) {
    return (
      <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-neutral-400">
        {error ? `Estado de tienda no disponible: ${error}` : "Leyendo estado de tienda…"}
      </div>
    );
  }

  const tone = TONE_CLASSES[getStoreTone(status.state)];
  const clock = formatStoreClock(nowMs, status.timezone);
  const next = getNextTransition(status);
  const countdown = formatCountdown(next.at, nowMs);

  return (
    <Link
      href="/operacion"
      aria-live="polite"
      className={[
        "mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border px-4 py-3 transition-colors hover:bg-white/[0.04]",
        tone.border,
        tone.bg,
      ].join(" ")}
    >
      <span className="flex items-center gap-2.5">
        <span className={["h-3 w-3 rounded-full", tone.dot, status.acceptingOrders ? "animate-pulse" : ""].join(" ")} />
        <span className={["text-lg font-black uppercase tracking-wide", tone.text].join(" ")}>
          {STORE_STATE_LABELS[status.state]}
        </span>
      </span>
      <span className="text-sm font-semibold text-white">
        {status.acceptingOrders ? "Recibiendo pedidos" : "No recibe pedidos"}
      </span>
      <span className="font-mono text-sm tabular-nums text-neutral-300">{clock.time}</span>
      {next.at && (
        <span className="text-sm text-neutral-300">
          {next.label} {formatStoreTime(next.at, status.timezone)}
          {countdown && <span className="text-neutral-500"> · {countdown}</span>}
        </span>
      )}
      <span className="ml-auto text-xs text-neutral-500">Operación →</span>
    </Link>
  );
}
