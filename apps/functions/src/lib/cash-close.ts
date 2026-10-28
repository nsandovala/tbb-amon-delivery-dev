/**
 * M6J — Resumen puro del cierre de caja de un día operacional.
 *
 * Reglas (ver docs/architecture/store-operation-contract.md):
 * - Solo las ventas `delivered` son dinero recibido (contracts/financial-events.md §3.0).
 * - `paymentMethod = "pending"` nunca es dinero recibido: va a "ventas pendientes".
 * - `cancelled` no suma en ninguna parte.
 * - Efectivo esperado = ventas entregadas en efectivo − gastos activos pagados en efectivo.
 * - Bloquean el cierre: cualquier pedido activo y pagos pendientes (salvo override auditado).
 *
 * FIN-01 (summaryVersion 2, aditivo):
 * - `transferSales` / `expectedTransfers` conservan su semántica (transferencias entregadas).
 * - Transferencias no confirmadas y no anuladas bloquean (`UNCONFIRMED_TRANSFERS`, con override).
 * - Cobros confirmados = libro `paymentEvents` imputado a esta jornada efectiva.
 * - Cancelado + pagado se informa como "reembolso por revisar": nunca es ingreso.
 */

import {
  classifyOrderPayment,
  summarizeTransferCollections,
  type LedgerEvent,
  type TransferCollections,
} from "./payment-ledger";

export const CASH_SUMMARY_VERSION = 2;

export const ACTIVE_ORDER_STATUSES = ["queued", "preparing", "ready", "on_the_way"] as const;

export type CashCloseOrder = {
  id: string;
  status?: string;
  channel?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  displayCode?: string;
  totals?: { total?: number };
};

export type CashCloseExpense = {
  id: string;
  amount?: number;
  paymentMethod?: string;
  status?: string;
};

export type CashBucket = { count: number; total: number };

export type CashCloseBlockerCode =
  | "ACTIVE_POS_SALES"
  | "ACTIVE_OTHER_ORDERS"
  | "PENDING_PAYMENTS"
  | "UNCONFIRMED_TRANSFERS";

export type CashCloseBlocker = CashBucket & {
  code: CashCloseBlockerCode;
  orderIds: string[];
  displayCodes: string[];
};

export type CashCloseSummary = {
  summaryVersion: number;
  operationalDate: string;
  ordersCount: number;
  cancelledCount: number;
  cashSales: CashBucket;
  transferSales: CashBucket;
  cardSales: CashBucket;
  pendingSales: CashBucket;
  activePosSales: CashBucket;
  activeOtherOrders: CashBucket;
  activeExpenses: CashBucket;
  cashExpenses: CashBucket;
  expectedCash: number;
  expectedTransfers: number;
  /** Transferencias entregadas de la jornada con pago confirmado / sin confirmar. */
  transferConfirmedSales: CashBucket;
  transferUnconfirmedSales: CashBucket;
  /** Pedidos de la jornada cancelados con pago confirmado: reembolso por revisar. */
  cancelledPaidTransfers: CashBucket;
  /** Cobros de transferencia imputados a esta jornada efectiva (libro paymentEvents). */
  transferCollections: TransferCollections;
  blockers: CashCloseBlocker[];
};

function amount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function bucket<T>(rows: T[], read: (row: T) => number): CashBucket {
  return { count: rows.length, total: rows.reduce((sum, row) => sum + read(row), 0) };
}

function isActive(status: string | undefined): boolean {
  return (ACTIVE_ORDER_STATUSES as readonly string[]).includes(status ?? "");
}

export function summarizeCashDay(input: {
  operationalDate: string;
  orders: CashCloseOrder[];
  expenses: CashCloseExpense[];
  paymentEvents?: LedgerEvent[];
}): CashCloseSummary {
  const orderTotal = (order: CashCloseOrder) => amount(order.totals?.total);
  const live = input.orders.filter((order) => order.status !== "cancelled");
  const delivered = live.filter((order) => order.status === "delivered");
  const deliveredBy = (method: string) =>
    delivered.filter((order) => order.paymentMethod === method);

  const pending = live.filter((order) => order.paymentMethod === "pending");
  const activePos = live.filter(
    (order) => order.channel === "admin_pos" && isActive(order.status)
  );
  const activeOther = live.filter(
    (order) => order.channel !== "admin_pos" && isActive(order.status)
  );

  // Gastos sin `status` se tratan como activos: así nacen todos desde createExpense.
  const activeExpenses = input.expenses.filter(
    (expense) => (expense.status ?? "active") === "active"
  );
  const cashExpenses = activeExpenses.filter((expense) => expense.paymentMethod === "cash");

  const transferStateOf = (order: CashCloseOrder) => classifyOrderPayment(order).transfer;
  const deliveredTransfers = deliveredBy("transfer");
  const unconfirmedTransfers = live.filter((order) => transferStateOf(order) === "unconfirmed");
  const cancelledPaid = input.orders.filter((order) => transferStateOf(order) === "cancelled_paid");

  const cashSales = bucket(deliveredBy("cash"), orderTotal);
  const transferSales = bucket(deliveredBy("transfer"), orderTotal);
  const cashExpensesBucket = bucket(cashExpenses, (expense) => amount(expense.amount));

  const blockers: CashCloseBlocker[] = [];
  const toBlocker = (code: CashCloseBlockerCode, rows: CashCloseOrder[]): CashCloseBlocker => ({
    code,
    ...bucket(rows, orderTotal),
    orderIds: rows.map((order) => order.id),
    displayCodes: rows.map((order) => order.displayCode ?? order.id.slice(0, 6)),
  });
  if (activePos.length > 0) blockers.push(toBlocker("ACTIVE_POS_SALES", activePos));
  if (activeOther.length > 0) blockers.push(toBlocker("ACTIVE_OTHER_ORDERS", activeOther));
  if (pending.length > 0) blockers.push(toBlocker("PENDING_PAYMENTS", pending));
  if (unconfirmedTransfers.length > 0) {
    blockers.push(toBlocker("UNCONFIRMED_TRANSFERS", unconfirmedTransfers));
  }

  return {
    summaryVersion: CASH_SUMMARY_VERSION,
    operationalDate: input.operationalDate,
    ordersCount: live.length,
    cancelledCount: input.orders.length - live.length,
    cashSales,
    transferSales,
    cardSales: bucket(deliveredBy("card"), orderTotal),
    pendingSales: bucket(pending, orderTotal),
    activePosSales: bucket(activePos, orderTotal),
    activeOtherOrders: bucket(activeOther, orderTotal),
    activeExpenses: bucket(activeExpenses, (expense) => amount(expense.amount)),
    cashExpenses: cashExpensesBucket,
    expectedCash: cashSales.total - cashExpensesBucket.total,
    expectedTransfers: transferSales.total,
    transferConfirmedSales: bucket(
      deliveredTransfers.filter((order) => transferStateOf(order) === "confirmed"),
      orderTotal
    ),
    transferUnconfirmedSales: bucket(
      deliveredTransfers.filter((order) => transferStateOf(order) === "unconfirmed"),
      orderTotal
    ),
    cancelledPaidTransfers: bucket(cancelledPaid, orderTotal),
    transferCollections: summarizeTransferCollections(input.operationalDate, input.paymentEvents ?? []),
    blockers,
  };
}

export function computeCashDifferences(
  summary: Pick<CashCloseSummary, "expectedCash" | "expectedTransfers"> & {
    transferCollections?: Pick<TransferCollections, "net">;
  },
  counted: { countedCash: number; transfersConfirmed: number }
): { cashDifference: number; transferDifference: number; collectionDifference: number } {
  return {
    cashDifference: counted.countedCash - summary.expectedCash,
    transferDifference: counted.transfersConfirmed - summary.expectedTransfers,
    // FIN-01: lo verificado en el banco contra los cobros confirmados en el sistema.
    collectionDifference: counted.transfersConfirmed - (summary.transferCollections?.net ?? 0),
  };
}
