/**
 * FIN-QA-02 — cronología unificada de la bitácora de Operación.
 *
 * Combina, solo en memoria y solo para lectura, los movimientos de tienda y
 * caja (`storeEvents`, servidos por `getStoreControl`) con los eventos del
 * libro `paymentEvents` (listener cliente, reglas `canViewPayments`).
 *
 * - No duplica eventos financieros: nada se copia a `storeEvents`.
 * - La parte financiera existe solo con `payments.view`. Sin el permiso no se
 *   abre la consulta y la bitácora queda igual que antes de FIN-01.
 * - De cada evento de pago se toman solo tipo, pedido, importe, fecha y actor.
 *   `reference`, `reason` e `idempotency` nunca llegan a la bitácora.
 * - Si el libro tiene más eventos que el tope de lectura, se marca desde dónde
 *   la cronología deja de incluir pagos (mismo criterio que FIN-A03).
 *
 * Contrato: docs/architecture/payment-confirmation-contract.md §7
 */

import type { StoreEvent } from "./api/store";
import type { LiveQueryView } from "./payment-presentation";
import { formatLocalDateTime } from "./store-status";

/** Eventos de pago recientes que lee la bitácora (se piden tope + 1). */
export const OPERATION_PAYMENT_EVENTS_LIMIT = 100;

export const PAYMENTS_VIEW_PERMISSION = "payments.view";

export function canReadPaymentLedger(permissions: readonly string[] | null | undefined): boolean {
  return Boolean(permissions?.includes(PAYMENTS_VIEW_PERMISSION));
}

export type TimelinePaymentEvent = {
  id: string;
  type: "transfer_confirmed" | "transfer_confirmation_reverted";
  orderId: string;
  /** Importe con signo: positivo al confirmar, negativo al revertir. */
  signedAmount: number;
  atMs: number;
  atLocal: string | null;
  actor: { uid: string; email: string | null; role: string | null } | null;
};

type RawPaymentEvent = {
  id?: unknown;
  type?: unknown;
  orderId?: unknown;
  signedAmount?: unknown;
  at?: unknown;
  atLocal?: unknown;
  actor?: unknown;
};

function toMillis(value: unknown): number | null {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (value instanceof Date) return value.getTime();
  return null;
}

/**
 * Lista blanca de campos. Devuelve null si el documento no es un evento de
 * transferencia reconocible (fail-closed: no se inventan filas).
 */
export function toTimelinePayment(raw: RawPaymentEvent): TimelinePaymentEvent | null {
  if (raw.type !== "transfer_confirmed" && raw.type !== "transfer_confirmation_reverted") return null;
  if (typeof raw.id !== "string" || typeof raw.orderId !== "string") return null;
  if (typeof raw.signedAmount !== "number" || !Number.isFinite(raw.signedAmount)) return null;
  const atMs = toMillis(raw.at);
  if (atMs === null) return null;
  const actor = raw.actor && typeof raw.actor === "object" ? (raw.actor as Record<string, unknown>) : null;
  return {
    id: raw.id,
    type: raw.type,
    orderId: raw.orderId,
    signedAmount: raw.signedAmount,
    atMs,
    atLocal: typeof raw.atLocal === "string" ? raw.atLocal : null,
    actor: actor && typeof actor.uid === "string"
      ? {
          uid: actor.uid,
          email: typeof actor.email === "string" ? actor.email : null,
          role: typeof actor.role === "string" ? actor.role : null,
        }
      : null,
  };
}

export type TimelineEntry =
  | { kind: "store"; key: string; atMs: number; event: StoreEvent }
  | { kind: "payment"; key: string; atMs: number; event: TimelinePaymentEvent }
  /** Desde aquí hacia atrás la bitácora ya no incluye pagos (libro truncado). */
  | { kind: "payments_gap"; key: string; atMs: number };

export type OperationTimeline = {
  entries: TimelineEntry[];
  /** Aviso sobre la parte financiera; null si está completa o no aplica. */
  paymentNotice: string | null;
  paymentCount: number;
};

function storeEventMillis(event: StoreEvent): number {
  return toMillis(event.at) ?? toMillis(event.atLocal) ?? 0;
}

/**
 * Mezcla ambos orígenes en orden cronológico descendente.
 * `payments` es null cuando el rol no tiene `payments.view`.
 */
export function buildOperationTimeline(
  storeEvents: StoreEvent[],
  payments: LiveQueryView<TimelinePaymentEvent[]> | null
): OperationTimeline {
  const seen = new Set<string>();
  const entries: TimelineEntry[] = [];

  for (const event of storeEvents) {
    const key = `store:${event.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ kind: "store", key, atMs: storeEventMillis(event), event });
  }

  let paymentNotice: string | null = null;
  let paymentCount = 0;
  let coverageFromMs: number | null = null;

  if (payments?.status === "loading") paymentNotice = "Cargando pagos de transferencia…";
  if (payments?.status === "error") paymentNotice = "Pagos de transferencia no disponibles en la bitácora.";
  if (payments?.status === "ready") {
    for (const event of payments.data) {
      const key = `payment:${event.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      paymentCount += 1;
      entries.push({ kind: "payment", key, atMs: event.atMs, event });
    }
    if (!payments.complete && paymentCount > 0) {
      const oldest = payments.data.reduce((min, event) => (event.atMs < min.atMs ? event : min));
      coverageFromMs = oldest.atMs;
      paymentNotice = `Pagos parciales: se muestran los ${paymentCount} más recientes. Antes de ${formatLocalDateTime(oldest.atLocal)} la bitácora no incluye pagos; usa el cierre de caja o el detalle del pedido.`;
    }
  }

  // Desempate estable: a igual hora, pagos antes que tienda y luego por clave.
  entries.sort((a, b) => b.atMs - a.atMs || (a.kind === b.kind ? a.key.localeCompare(b.key) : a.kind === "payment" ? -1 : 1));

  if (coverageFromMs !== null) {
    const index = entries.findIndex((entry) => entry.atMs < coverageFromMs!);
    if (index !== -1) entries.splice(index, 0, { kind: "payments_gap", key: "payments_gap", atMs: coverageFromMs });
  }

  return { entries, paymentNotice, paymentCount };
}

export const PAYMENT_EVENT_LABELS: Record<TimelinePaymentEvent["type"], string> = {
  transfer_confirmed: "Transferencia confirmada",
  transfer_confirmation_reverted: "Confirmación revertida",
};

/** Importe con signo explícito: "+$12.500" o "−$12.500". */
export function formatSignedClp(signedAmount: number): string {
  const sign = signedAmount < 0 ? "−" : "+";
  return `${sign}$${Math.abs(signedAmount).toLocaleString("es-CL")}`;
}

export function paymentActorLabel(actor: TimelinePaymentEvent["actor"]): string {
  if (!actor) return "Actor no registrado";
  return actor.email ?? actor.uid;
}
