"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Coins,
  type LucideIcon,
  ReceiptText,
  ShoppingBag,
  Wallet,
} from "lucide-react";
import { useLiveExpenses } from "../../hooks/use-live-expenses";
import { useLiveOrders } from "../../hooks/use-live-orders";
import {
  EXPENSE_PAYMENT_METHOD_LABELS,
  type AdminExpense,
} from "../../lib/firebase/queries/expenses";
import {
  type AdminOrder,
  type OrderStatus,
} from "../../lib/firebase/queries/orders";
import {
  OPERATIONAL_DAY_CUTOFF_HOUR,
  getOperationalDayStart,
  toDate,
} from "../../lib/time";

const tenantId = "tbb";

type MetricsPeriod = "today" | "last7" | "last30";
type SupportedPaymentMethod = "cash" | "transfer" | "pending";

const PERIOD_OPTIONS: {
  value: MetricsPeriod;
  label: string;
  detail: string;
}[] = [
  {
    value: "today",
    label: "Hoy operacional",
    detail: `Corte ${String(OPERATIONAL_DAY_CUTOFF_HOUR).padStart(2, "0")}:00`,
  },
  { value: "last7", label: "Ultimos 7 dias", detail: "Ventana rolling" },
  { value: "last30", label: "Ultimos 30 dias", detail: "Ventana rolling" },
];

const ACTIVE_ORDER_STATUSES = new Set<OrderStatus>([
  "queued",
  "preparing",
  "ready",
  "on_the_way",
]);

const PAYMENT_METHODS: SupportedPaymentMethod[] = ["cash", "transfer", "pending"];

function formatMoney(value?: number) {
  return `$${Math.round(value ?? 0).toLocaleString("es-CL")}`;
}

function formatDateTime(date: Date) {
  return date.toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getOrderTotal(order: AdminOrder) {
  return order.totals?.total ?? 0;
}

function formatPaymentMethodLabel(method?: string) {
  switch (method) {
    case "cash":
    case "transfer":
    case "pending":
      return EXPENSE_PAYMENT_METHOD_LABELS[method];
    case "card":
      return "Tarjeta";
    default:
      return method ?? "Sin definir";
  }
}

function isActiveExpense(expense: AdminExpense) {
  return (expense.status ?? "active") === "active";
}

function isWithinRange(value: Date | null, start: Date, end: Date) {
  if (!value) return false;
  const timestamp = value.getTime();
  return timestamp >= start.getTime() && timestamp <= end.getTime();
}

function getPeriodRange(period: MetricsPeriod, now: Date) {
  const end = now;
  const operationalStart = getOperationalDayStart(now);

  if (period === "today") {
    return { start: operationalStart, end };
  }

  const days = period === "last7" ? 7 : 30;
  const start = new Date(operationalStart);
  start.setDate(start.getDate() - (days - 1));
  return { start, end };
}

function summarizePayments<T extends { paymentMethod?: string }>(
  records: T[],
  getAmount: (record: T) => number
) {
  const totals: Record<SupportedPaymentMethod, number> = {
    cash: 0,
    transfer: 0,
    pending: 0,
  };
  let other = 0;

  records.forEach((record) => {
    const amount = getAmount(record);
    switch (record.paymentMethod) {
      case "cash":
      case "transfer":
      case "pending":
        totals[record.paymentMethod] += amount;
        break;
      default:
        other += amount;
        break;
    }
  });

  return { totals, other };
}

function getChannelSummary(orders: AdminOrder[]) {
  return orders.reduce(
    (acc, order) => {
      const total = getOrderTotal(order);

      if (order.channel === "web") {
        acc.web.total += total;
        acc.web.count += 1;
      } else if (order.channel === "admin_pos") {
        acc.adminPos.total += total;
        acc.adminPos.count += 1;
      }

      return acc;
    },
    {
      web: { total: 0, count: 0 },
      adminPos: { total: 0, count: 0 },
    }
  );
}

function StatCard({
  label,
  value,
  detail,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  accent: string;
  icon: LucideIcon;
}) {
  return (
    <article className="overflow-hidden rounded-3xl border border-white/10 bg-[#101010]">
      <div className="flex items-start justify-between gap-3 border-b border-white/6 px-5 py-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">{label}</p>
          <p className={["mt-2 text-3xl font-black tracking-tight", accent].join(" ")}>{value}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <Icon className={["h-5 w-5", accent].join(" ")} />
        </div>
      </div>
      <p className="px-5 py-3 text-sm text-neutral-500">{detail}</p>
    </article>
  );
}

function PaymentBreakdown({
  title,
  rows,
  other,
}: {
  title: string;
  rows: Record<SupportedPaymentMethod, number>;
  other: number;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-[#101010] p-5">
      <div className="mb-4">
        <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">Desglose</p>
        <h2 className="mt-1 text-xl font-black text-white">{title}</h2>
      </div>

      <div className="space-y-3">
        {PAYMENT_METHODS.map((paymentMethod) => (
          <div
            key={paymentMethod}
            className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3"
          >
            <div>
              <p className="text-sm font-semibold text-white">
                {EXPENSE_PAYMENT_METHOD_LABELS[paymentMethod]}
              </p>
              <p className="text-xs text-neutral-500">Metodo operativo</p>
            </div>
            <p className="text-base font-black text-emerald-300">
              {formatMoney(rows[paymentMethod])}
            </p>
          </div>
        ))}

        {other > 0 ? (
          <div className="flex items-center justify-between rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-amber-100">Otros legacy</p>
              <p className="text-xs text-amber-200/70">Fuera del set cash/transfer/pending</p>
            </div>
            <p className="text-base font-black text-amber-200">{formatMoney(other)}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default function MetricasPage() {
  const { orders, loading: loadingOrders, error: ordersError } = useLiveOrders(tenantId);
  const { expenses, loading: loadingExpenses, error: expensesError } = useLiveExpenses(tenantId);

  const [selectedPeriod, setSelectedPeriod] = useState<MetricsPeriod>("today");
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowTs(Date.now()), 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  const periodRange = useMemo(
    () => getPeriodRange(selectedPeriod, new Date(nowTs)),
    [selectedPeriod, nowTs]
  );

  const metrics = useMemo(() => {
    const filteredOrders = orders.filter((order) =>
      isWithinRange(toDate(order.createdAt), periodRange.start, periodRange.end)
    );
    const filteredExpenses = expenses.filter((expense) =>
      isWithinRange(
        toDate(expense.occurredAt ?? expense.createdAt),
        periodRange.start,
        periodRange.end
      )
    );

    const validOrders = filteredOrders.filter((order) => order.status !== "cancelled");
    const cancelledOrders = filteredOrders.length - validOrders.length;
    const activeExpenses = filteredExpenses.filter(isActiveExpense);

    const grossSales = validOrders.reduce((acc, order) => acc + getOrderTotal(order), 0);
    const totalExpenses = activeExpenses.reduce(
      (acc, expense) => acc + (expense.amount ?? 0),
      0
    );
    const netOperational = grossSales - totalExpenses;

    const salesPayments = summarizePayments(validOrders, getOrderTotal);
    const expensePayments = summarizePayments(
      activeExpenses,
      (expense) => expense.amount ?? 0
    );
    const channelSummary = getChannelSummary(validOrders);
    const openAdminPosOrders = filteredOrders
      .filter(
        (order) =>
          order.channel === "admin_pos" &&
          ACTIVE_ORDER_STATUSES.has(order.status as OrderStatus)
      )
      .sort((left, right) => {
        const leftTs = toDate(left.createdAt)?.getTime() ?? 0;
        const rightTs = toDate(right.createdAt)?.getTime() ?? 0;
        return rightTs - leftTs;
      });

    const orderCount = validOrders.length;
    const averageTicket = orderCount > 0 ? grossSales / orderCount : 0;

    return {
      grossSales,
      totalExpenses,
      netOperational,
      estimatedCash: salesPayments.totals.cash - expensePayments.totals.cash,
      averageTicket,
      orderCount,
      cancelledOrders,
      salesPayments,
      expensePayments,
      channelSummary,
      openAdminPosOrders,
    };
  }, [expenses, orders, periodRange.end, periodRange.start]);

  const loading = loadingOrders || loadingExpenses;
  const error = ordersError ?? expensesError;

  return (
    <main className="min-h-screen bg-[#0B0B0B] text-white">
      <div className="mx-auto max-w-[1500px] px-4 py-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-400/80">
              Radar operativo
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-white">
              Metricas TBB / Foodtruck
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-neutral-400">
              Dashboard minimo derivado en vivo desde orders y expenses. Sin snapshots,
              sin persistencia nueva, sin tocar ERP.
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
              Ventana activa
            </p>
            <p className="mt-1 text-sm font-semibold text-white">
              {formatDateTime(periodRange.start)} {"->"} {formatDateTime(periodRange.end)}
            </p>
          </div>
        </div>

        <div className="mb-4 flex max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {PERIOD_OPTIONS.map((option) => {
            const active = option.value === selectedPeriod;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setSelectedPeriod(option.value)}
                className={[
                  "shrink-0 rounded-full border px-4 py-2 text-left transition-all",
                  active
                    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300 shadow-[0_0_0_1px_rgba(0,255,156,0.05),0_0_18px_rgba(0,255,156,0.08)]"
                    : "border-white/10 bg-white/[0.03] text-neutral-400 hover:border-white/20 hover:text-white",
                ].join(" ")}
              >
                <p className="text-xs font-black uppercase tracking-[0.14em]">{option.label}</p>
                <p className="mt-1 text-[11px]">{option.detail}</p>
              </button>
            );
          })}
        </div>

        <div className="mb-6 rounded-3xl border border-amber-400/20 bg-amber-400/[0.06] p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-2">
              <AlertTriangle className="h-4 w-4 text-amber-200" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-100">Advertencia de caja</p>
              <p className="mt-1 text-sm text-amber-200/80">
                Caja estimada no considera saldo inicial ni cierre formal de caja.
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-white/10 bg-[#101010] px-6 py-10 text-center text-neutral-400">
            Cargando metricas operativas...
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-red-500/20 bg-red-500/[0.06] p-6 text-sm text-red-200">
            <p className="font-semibold">No pudimos calcular las metricas</p>
            <p className="mt-1 text-red-200/70">
              {error.message.toLowerCase().includes("failed to fetch")
                ? "Sin conexion al servidor o al emulador."
                : error.message}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <StatCard
                label="Ventas brutas"
                value={formatMoney(metrics.grossSales)}
                detail={`Canceladas fuera del KPI: ${metrics.cancelledOrders}`}
                accent="text-emerald-300"
                icon={ArrowUpRight}
              />
              <StatCard
                label="Gastos activos"
                value={formatMoney(metrics.totalExpenses)}
                detail="Solo gastos con status active dentro de la ventana."
                accent="text-orange-300"
                icon={ArrowDownLeft}
              />
              <StatCard
                label="Neto operacional"
                value={formatMoney(metrics.netOperational)}
                detail="Ventas brutas menos gastos activos."
                accent={
                  metrics.netOperational >= 0 ? "text-cyan-300" : "text-red-300"
                }
                icon={Coins}
              />
              <StatCard
                label="Caja estimada"
                value={formatMoney(metrics.estimatedCash)}
                detail="Ventas cash menos gastos cash."
                accent={
                  metrics.estimatedCash >= 0 ? "text-amber-200" : "text-red-300"
                }
                icon={Wallet}
              />
              <StatCard
                label="Ticket promedio"
                value={formatMoney(metrics.averageTicket)}
                detail="Promedio sobre pedidos no cancelados."
                accent="text-violet-300"
                icon={ReceiptText}
              />
              <StatCard
                label="Numero de pedidos"
                value={String(metrics.orderCount)}
                detail="Pedidos no cancelados en el periodo seleccionado."
                accent="text-white"
                icon={ShoppingBag}
              />
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_380px]">
              <PaymentBreakdown
                title="Ventas por metodo"
                rows={metrics.salesPayments.totals}
                other={metrics.salesPayments.other}
              />

              <PaymentBreakdown
                title="Gastos por metodo"
                rows={metrics.expensePayments.totals}
                other={metrics.expensePayments.other}
              />

              <section className="rounded-3xl border border-white/10 bg-[#101010] p-5">
                <div className="mb-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
                    Canal
                  </p>
                  <h2 className="mt-1 text-xl font-black text-white">Ventas web vs admin_pos</h2>
                </div>

                <div className="space-y-3">
                  <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">Web</p>
                        <p className="text-xs text-neutral-500">
                          {metrics.channelSummary.web.count} pedidos
                        </p>
                      </div>
                      <p className="text-lg font-black text-emerald-300">
                        {formatMoney(metrics.channelSummary.web.total)}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">Admin POS</p>
                        <p className="text-xs text-neutral-500">
                          {metrics.channelSummary.adminPos.count} pedidos
                        </p>
                      </div>
                      <p className="text-lg font-black text-cyan-300">
                        {formatMoney(metrics.channelSummary.adminPos.total)}
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            </section>

            <section className="rounded-3xl border border-white/10 bg-[#101010] p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
                    Alerta operativa
                  </p>
                  <h2 className="mt-1 text-xl font-black text-white">
                    Ordenes admin_pos activas sin cerrar
                  </h2>
                </div>
                <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.08] px-4 py-2">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-amber-200/80">
                    Conteo
                  </p>
                  <p className="mt-1 text-2xl font-black text-amber-100">
                    {metrics.openAdminPosOrders.length}
                  </p>
                </div>
              </div>

              {metrics.openAdminPosOrders.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-8 text-center text-neutral-500">
                  No hay ventas POS abiertas en este periodo.
                </div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {metrics.openAdminPosOrders.slice(0, 6).map((order) => {
                    const createdAt = toDate(order.createdAt);
                    return (
                      <div
                        key={order.id}
                        className="rounded-2xl border border-white/8 bg-[#0D0D0D] p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-black text-white">
                              #{order.id.slice(0, 6).toUpperCase()}
                            </p>
                            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-neutral-500">
                              {order.status ?? "Sin estado"}
                            </p>
                          </div>
                          <p className="text-lg font-black text-emerald-300">
                            {formatMoney(getOrderTotal(order))}
                          </p>
                        </div>

                        <div className="mt-4 space-y-1 text-sm text-neutral-400">
                          <p>Pago: {formatPaymentMethodLabel(order.paymentMethod)}</p>
                          <p>
                            Cliente: {order.customer?.name || order.customer?.phone || "Sin dato"}
                          </p>
                          <p>
                            Creada: {createdAt ? formatDateTime(createdAt) : "Sin timestamp"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
