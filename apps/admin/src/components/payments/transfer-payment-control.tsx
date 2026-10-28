"use client";

import { useRef, useState } from "react";
import { BadgeCheck, CircleAlert, RotateCcw } from "lucide-react";
import {
  confirmTransferPaymentApi,
  listOrderPaymentEventsApi,
  newPaymentIdempotencyKey,
  PaymentApiError,
  revertTransferConfirmationApi,
  type PaymentEventRow,
} from "@/lib/api/payments";
import { classifyOrderPayment } from "@/lib/payment-ledger";
import { formatClp } from "@/lib/clp";
import { paymentHistoryNotice } from "@/lib/payment-presentation";
import type { AdminOrder } from "@/lib/firebase/queries/orders";

/**
 * FIN-01 — confirmar o revertir la transferencia de UN pedido.
 *
 * El pago es independiente del estado operacional: se puede confirmar antes
 * de la entrega. La reversión es una corrección contable (el abono no existe
 * o no corresponde), nunca un reembolso. El estado mostrado viene del
 * listener del pedido, no de la respuesta: un replay no "re-confirma" nada.
 */

type Props = {
  tenantId: string;
  order: {
    id: string;
    status?: string;
    paymentMethod?: string;
    paymentStatus?: string;
    paymentConfirmation?: AdminOrder["paymentConfirmation"];
    totals?: { total?: number };
  };
  /** Variante compacta para listas (POS); sin historial. */
  compact?: boolean;
};

const ERROR_COPY: Record<string, string> = {
  CASH_DAY_CLOSED: "La caja de la jornada actual ya está cerrada. Registra la operación en la próxima jornada.",
  AMOUNT_MISMATCH: "El monto no coincide con el total del pedido. No confirmes un abono distinto: anótalo en la observación de caja.",
  PAYMENT_ALREADY_CONFIRMED: "Otro operador ya confirmó esta transferencia.",
  STALE_CONFIRMATION: "La confirmación cambió mientras revisabas. Actualiza el pedido.",
  PAYMENT_NOT_CONFIRMED: "El pedido ya no tiene una confirmación vigente.",
  ORDER_CANCELLED: "El pedido está cancelado; no se puede confirmar su pago.",
  FORBIDDEN: "Tu rol no tiene permiso para confirmar pagos.",
};

function errorMessage(err: unknown): string {
  if (err instanceof PaymentApiError && err.code && ERROR_COPY[err.code]) return ERROR_COPY[err.code];
  return err instanceof Error ? err.message : "No se pudo registrar la operación de pago.";
}

/** Un 409/403 es definitivo: la próxima acción del operador es un intento nuevo. */
function isDefinitive(err: unknown): boolean {
  return err instanceof PaymentApiError && (err.status === 409 || err.status === 403 || err.status === 400);
}

export function TransferPaymentControl({ tenantId, order, compact = false }: Props) {
  const [mode, setMode] = useState<"idle" | "confirm" | "revert">("idle");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // FIN-A03: se conserva `complete` para declarar un historial parcial.
  const [history, setHistory] = useState<{ events: PaymentEventRow[]; complete: boolean } | null>(null);
  const confirmKey = useRef(newPaymentIdempotencyKey());
  const revertKey = useRef(newPaymentIdempotencyKey());

  const state = classifyOrderPayment(order).transfer;
  if (state === null) return null;
  const total = order.totals?.total ?? 0;
  const confirmation = order.paymentStatus === "paid" ? order.paymentConfirmation ?? null : null;

  async function run(action: () => Promise<unknown>, key: { current: string }) {
    setBusy(true);
    setError(null);
    try {
      await action();
      key.current = newPaymentIdempotencyKey();
      setMode("idle");
      setReason("");
      setReference("");
      if (history) setHistory(null);
    } catch (err) {
      setError(errorMessage(err));
      // Error de red: se conserva la clave para reintentar de forma idempotente.
      if (isDefinitive(err)) key.current = newPaymentIdempotencyKey();
    } finally {
      setBusy(false);
    }
  }

  const confirm = () =>
    run(
      () => confirmTransferPaymentApi({
        tenantId,
        orderId: order.id,
        expectedAmount: total,
        reference: reference.trim() || undefined,
        idempotencyKey: confirmKey.current,
      }),
      confirmKey
    );

  const revert = () =>
    confirmation &&
    run(
      () => revertTransferConfirmationApi({
        tenantId,
        orderId: order.id,
        expectedConfirmationEventId: confirmation.eventId,
        reason: reason.trim(),
        idempotencyKey: revertKey.current,
      }),
      revertKey
    );

  async function loadHistory() {
    try {
      setHistory(await listOrderPaymentEventsApi(tenantId, order.id));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const chip =
    state === "confirmed" ? (
      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
        <BadgeCheck className="h-3.5 w-3.5" /> Transferencia confirmada
        {confirmation?.effectiveOperationalDate ? ` · jornada ${confirmation.effectiveOperationalDate}` : ""}
      </span>
    ) : state === "cancelled_paid" ? (
      <span className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-300">
        <CircleAlert className="h-3.5 w-3.5" /> Cancelado con pago confirmado · reembolso por revisar
      </span>
    ) : state === "cancelled_unpaid" ? null : (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
        <CircleAlert className="h-3.5 w-3.5" /> Transferencia sin confirmar
      </span>
    );

  return (
    <div className={compact ? "mt-2 space-y-2" : "space-y-3"} data-testid="transfer-payment-control">
      <div className="flex flex-wrap items-center gap-2">
        {chip}
        {state === "unconfirmed" && mode === "idle" && (
          <button
            type="button"
            onClick={() => setMode("confirm")}
            className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20"
          >
            Confirmar transferencia
          </button>
        )}
        {confirmation && mode === "idle" && (
          <button
            type="button"
            onClick={() => setMode("revert")}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1 text-xs text-neutral-300 hover:bg-white/5"
          >
            <RotateCcw className="h-3 w-3" /> Revertir confirmación
          </button>
        )}
      </div>

      {mode === "confirm" && (
        <div className="space-y-2 rounded-md border border-emerald-500/25 bg-emerald-500/[0.05] p-3">
          <p className="text-xs text-neutral-200">
            ¿Verificaste en el banco un abono de <strong className="tabular-nums">{formatClp(total)}</strong> para este pedido?
          </p>
          <input
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            maxLength={40}
            placeholder="Referencia opcional (ej. últimos dígitos de la operación)"
            className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
          />
          <div className="flex gap-2">
            <button type="button" disabled={busy || total <= 0} onClick={() => void confirm()} className="flex-1 rounded-md border border-emerald-500/40 bg-emerald-500/20 px-3 py-2 text-sm font-bold text-emerald-50 disabled:opacity-50">
              {busy ? "Confirmando…" : "Sí, confirmar abono"}
            </button>
            <button type="button" disabled={busy} onClick={() => { setMode("idle"); setError(null); }} className="rounded-md border border-white/10 px-3 py-2 text-sm text-neutral-300">
              Volver
            </button>
          </div>
        </div>
      )}

      {mode === "revert" && (
        <div className="space-y-2 rounded-md border border-red-500/25 bg-red-500/[0.05] p-3">
          <p className="text-xs text-neutral-200">
            Revertir corrige una confirmación errónea (el abono no existe o no corresponde). <strong>No es un reembolso</strong>: no devuelve dinero al cliente.
          </p>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={280}
            placeholder="Motivo obligatorio (mín. 5 caracteres)"
            className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
          />
          <div className="flex gap-2">
            <button type="button" disabled={busy || reason.trim().length < 5} onClick={() => void revert()} className="flex-1 rounded-md border border-red-500/40 bg-red-500/20 px-3 py-2 text-sm font-bold text-red-50 disabled:opacity-50">
              {busy ? "Revirtiendo…" : "Revertir confirmación"}
            </button>
            <button type="button" disabled={busy} onClick={() => { setMode("idle"); setError(null); }} className="rounded-md border border-white/10 px-3 py-2 text-sm text-neutral-300">
              Volver
            </button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}

      {!compact && (
        history ? (
          <ul className="space-y-1 text-[11px] text-neutral-400">
            {paymentHistoryNotice(history) && (
              <li role="status" className="font-semibold text-amber-300">{paymentHistoryNotice(history)}</li>
            )}
            {history.events.length === 0 && <li>Sin eventos de pago.</li>}
            {history.events.map((event) => (
              <li key={event.id}>
                {event.type === "transfer_confirmed" ? "Confirmada" : "Revertida"} {formatClp(Math.abs(event.signedAmount))} ·
                jornada {event.effectiveOperationalDate} · {event.actor?.email ?? event.actor?.uid ?? "—"}
                {event.reason ? ` · “${event.reason}”` : ""}
                {event.reference ? ` · ref ${event.reference}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <button type="button" onClick={() => void loadHistory()} className="text-[11px] text-neutral-500 underline-offset-2 hover:underline">
            Ver historial de pago
          </button>
        )
      )}
    </div>
  );
}
