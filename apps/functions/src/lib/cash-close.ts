/**
 * M6J — Resumen puro del cierre de caja de un día operacional.
 *
 * Reglas (ver docs/architecture/store-operation-contract.md):
 * - Solo las ventas `delivered` son dinero recibido (contracts/financial-events.md §3.0).
 * - `paymentMethod = "pending"` nunca es dinero recibido: va a "ventas pendientes".
 * - `cancelled` no suma en ninguna parte.
 * - Efectivo esperado = ventas entregadas en efectivo − gastos activos pagados en efectivo.
 * - Bloquean el cierre: ventas POS activas y pagos pendientes (salvo override auditado).
 */

export const ACTIVE_ORDER_STATUSES = ["queued", "preparing", "ready", "on_the_way"] as const;

export type CashCloseOrder = {
  id: string;
  status?: string;
  channel?: string;
  paymentMethod?: string;
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

export type CashCloseBlockerCode = "ACTIVE_POS_SALES" | "PENDING_PAYMENTS";

export type CashCloseBlocker = CashBucket & {
  code: CashCloseBlockerCode;
  orderIds: string[];
  displayCodes: string[];
};

export type CashCloseSummary = {
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
  if (pending.length > 0) blockers.push(toBlocker("PENDING_PAYMENTS", pending));

  return {
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
    blockers,
  };
}

export function computeCashDifferences(
  summary: Pick<CashCloseSummary, "expectedCash" | "expectedTransfers">,
  counted: { countedCash: number; transfersConfirmed: number }
): { cashDifference: number; transferDifference: number } {
  return {
    cashDifference: counted.countedCash - summary.expectedCash,
    transferDifference: counted.transfersConfirmed - summary.expectedTransfers,
  };
}
