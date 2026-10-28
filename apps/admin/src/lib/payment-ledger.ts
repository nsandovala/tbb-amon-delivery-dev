/**
 * FIN-01 — ESPEJO de apps/functions/src/lib/payment-ledger.ts para Métricas.
 *
 * Functions compila a CommonJS y no comparte módulos en runtime con el admin;
 * por eso la lógica vive duplicada. `e2e/unit/fin-01-ledger.spec.ts` ejecuta
 * ambas copias sobre todas las combinaciones y falla si divergen. Editar las
 * dos a la vez. Contrato: docs/architecture/payment-confirmation-contract.md
 */

export const PAYMENT_EVENT_TYPES = ["transfer_confirmed", "transfer_confirmation_reverted"] as const;
export type PaymentEventType = (typeof PAYMENT_EVENT_TYPES)[number];

/** Tope de eventos por jornada que el cierre puede verificar en una transacción. */
export const MAX_PAYMENT_EVENTS_PER_DAY = 500;

export type LedgerOrder = {
  status?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  totals?: { total?: number };
};

export type TransferState = "unconfirmed" | "confirmed" | "cancelled_unpaid" | "cancelled_paid";

export type OrderPaymentClass = {
  /** Venta registrada: todo pedido no anulado. */
  registeredSale: boolean;
  /** Venta entregada: `status === "delivered"`. */
  deliveredSale: boolean;
  /** Solo para `paymentMethod === "transfer"`; null en cualquier otro método. */
  transfer: TransferState | null;
};

export function classifyOrderPayment(order: LedgerOrder): OrderPaymentClass {
  const cancelled = order.status === "cancelled";
  const paid = order.paymentStatus === "paid";
  let transfer: TransferState | null = null;
  if (order.paymentMethod === "transfer") {
    if (cancelled) transfer = paid ? "cancelled_paid" : "cancelled_unpaid";
    else transfer = paid ? "confirmed" : "unconfirmed";
  }
  return { registeredSale: !cancelled, deliveredSale: order.status === "delivered", transfer };
}

export type LedgerEvent = {
  type?: string;
  signedAmount?: number;
  effectiveOperationalDate?: string;
  originOperationalDate?: string;
};

export type LedgerBucket = { count: number; total: number };

export type TransferCollections = {
  /** Confirmaciones de pedidos de la misma jornada efectiva. */
  confirmed: LedgerBucket;
  /** Confirmaciones de pedidos de jornadas anteriores (confirmación tardía). */
  late: LedgerBucket;
  /** Reversiones imputadas a esta jornada (total en valor absoluto). */
  reverted: LedgerBucket;
  /** Σ signedAmount: el cobro neto de transferencias de la jornada. */
  net: number;
  eventCount: number;
  /**
   * false si la lectura alcanzó el tope: el desglose y el neto NO son totales
   * conciliados y no deben presentarse como tales.
   */
  complete: boolean;
};

function amount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Agrega los eventos de una jornada efectiva. `truncated` indica que la
 * consulta devolvió más eventos que el tope; en ese caso solo se agregan los
 * primeros `MAX_PAYMENT_EVENTS_PER_DAY` y el resultado se marca incompleto.
 */
export function summarizeTransferCollections(
  operationalDate: string,
  events: LedgerEvent[],
  limit = MAX_PAYMENT_EVENTS_PER_DAY
): TransferCollections {
  const complete = events.length <= limit;
  const rows = events.slice(0, limit);
  const result: TransferCollections = {
    confirmed: { count: 0, total: 0 },
    late: { count: 0, total: 0 },
    reverted: { count: 0, total: 0 },
    net: 0,
    eventCount: rows.length,
    complete,
  };
  for (const event of rows) {
    const signed = amount(event.signedAmount);
    result.net += signed;
    if (event.type === "transfer_confirmed") {
      const target = event.originOperationalDate && event.originOperationalDate < operationalDate
        ? result.late
        : result.confirmed;
      target.count += 1;
      target.total += signed;
    } else if (event.type === "transfer_confirmation_reverted") {
      result.reverted.count += 1;
      result.reverted.total += Math.abs(signed);
    }
  }
  return result;
}

export type LedgerCounter = { transferEventCount?: number; transferNet?: number } | null | undefined;

/**
 * FIN-H01: el libro de la jornada debe coincidir con el contador transaccional
 * `orderCounters/{D}.payments`. Un día sin eventos ni contador cuadra en 0.
 */
export function ledgerMatchesCounter(collections: TransferCollections, counter: LedgerCounter): boolean {
  return (
    collections.complete
    && collections.eventCount === amount(counter?.transferEventCount)
    && collections.net === amount(counter?.transferNet)
  );
}
