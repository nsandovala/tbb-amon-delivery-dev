"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  CircleHelp,
  Coins,
  Moon,
  Sun,
  Users,
} from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useLiveExpenses } from "../../hooks/use-live-expenses";
import { useLiveOrders } from "../../hooks/use-live-orders";
import { type AdminExpense } from "../../lib/firebase/queries/expenses";
import { type AdminOrder } from "../../lib/firebase/queries/orders";
import { auth, db } from "../../lib/firebase/client";
import { getOperationalDayStart, OPERATIONAL_DAY_CUTOFF_HOUR, toDate } from "../../lib/time";

const tenantId = "tbb";
type Period = "today" | "last7" | "last30" | "custom";
type Channel = "all" | "web" | "admin_pos";
type ProductMetric = "units" | "revenue";
type Source = NonNullable<AdminOrder["acquisitionSource"]>;

type TenantInfo = { name?: string; location?: { commune?: string; city?: string } };
type Range = { start: Date; end: Date };
type DayPoint = {
  key: string;
  date: Date;
  label: string;
  sales: number;
  count: number;
  products: { name: string; qty: number }[];
};

const SOURCES: { id: Source; label: string }[] = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "in_person", label: "Presencial" },
  { id: "other", label: "Otro" },
];
const PERIODS: { id: Exclude<Period, "custom">; label: string }[] = [
  { id: "today", label: "Hoy operacional" },
  { id: "last7", label: "Últimos 7 días" },
  { id: "last30", label: "Últimos 30 días" },
];

function money(value: number) {
  return `$${Math.round(value).toLocaleString("es-CL")}`;
}
function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function shortDate(date: Date) {
  return date.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function dayName(date: Date) {
  return date.toLocaleDateString("es-CL", { weekday: "short" }).replace(".", "");
}
function within(value: Date | null, range: Range) {
  if (!value) return false;
  return value >= range.start && value <= range.end;
}
function rangeFor(period: Period, now: Date, customStart: string, customEnd: string): Range {
  const end = new Date(now);
  if (period === "custom" && customStart && customEnd) {
    const start = new Date(`${customStart}T00:00:00`);
    const customFinish = new Date(`${customEnd}T23:59:59.999`);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(customFinish.getTime()) && start <= customFinish) {
      return { start, end: customFinish < end ? customFinish : end };
    }
  }
  const operationalStart = getOperationalDayStart(now);
  const days = period === "today" ? 1 : period === "last30" ? 30 : 7;
  const start = new Date(operationalStart);
  start.setDate(start.getDate() - (days - 1));
  return { start, end };
}
function previousRange(range: Range): Range {
  const length = Math.max(1, range.end.getTime() - range.start.getTime() + 1);
  const end = new Date(range.start.getTime() - 1);
  return { start: new Date(end.getTime() - length + 1), end };
}
function amount(order: AdminOrder) {
  return order.totals?.total ?? 0;
}
function productName(item: NonNullable<AdminOrder["items"]>[number]) {
  return item.productName || item.name || item.productId || "Producto sin nombre";
}
function productRevenue(item: NonNullable<AdminOrder["items"]>[number]) {
  return item.subtotal ?? (item.unitPrice ?? 0) * (item.qty ?? 0);
}
function percent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}
function isDemoOrder(order: AdminOrder) {
  return /^DEMO\d+/i.test(order.id);
}
function isActiveExpense(expense: AdminExpense) {
  return (expense.status ?? "active") === "active";
}

function Info({ label }: { label: string }) {
  return <span title={label} aria-label={label} className="ml-1 inline-flex align-middle text-current/65"><CircleHelp className="h-3.5 w-3.5" /></span>;
}

function KpiCard({
  label,
  value,
  detail,
  tone = "default",
  comparison,
  helper,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "accent" | "warning";
  comparison?: { value: string; positive: boolean | null };
  helper: string;
}) {
  return (
    <article className={`metric-surface metric-kpi metric-kpi-${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="metric-label">{label}<Info label={helper} /></p>
        {comparison && <span className={`metric-comparison ${comparison.positive === null ? "" : comparison.positive ? "is-positive" : "is-negative"}`}>{comparison.value}</span>}
      </div>
      <p className="metric-kpi-value">{value}</p>
      <p className="metric-muted mt-1 text-xs">{detail}</p>
    </article>
  );
}

function SalesTrend({ days, mode, setMode }: { days: DayPoint[]; mode: "sales" | "orders"; setMode: (mode: "sales" | "orders") => void }) {
  const maxValue = Math.max(1, ...days.map((day) => mode === "sales" ? day.sales : day.count));
  const total = days.reduce((sum, day) => sum + (mode === "sales" ? day.sales : day.count), 0);
  const average = days.length ? total / days.length : 0;
  const activeDays = days.filter((day) => day.count > 0);
  const topDay = activeDays.reduce<DayPoint | null>((best, day) => !best || day.sales > best.sales ? day : best, null);

  return (
    <section className="metric-surface metric-panel min-w-0" aria-labelledby="trend-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="metric-label">Actividad por jornada · corte {String(OPERATIONAL_DAY_CUTOFF_HOUR).padStart(2, "0")}:00</p>
          <h2 id="trend-title" className="metric-heading mt-1">¿Qué días tuvieron movimiento?</h2>
          <p className="metric-muted mt-1 text-xs">Los días sin ventas no se clasifican como “malos” sin historial suficiente.</p>
        </div>
        <div className="metric-segment" role="group" aria-label="Métrica del gráfico">
          <button type="button" aria-pressed={mode === "sales"} onClick={() => setMode("sales")}>Ventas</button>
          <button type="button" aria-pressed={mode === "orders"} onClick={() => setMode("orders")}>Pedidos</button>
        </div>
      </div>
      <div className="metric-chart" role="group" aria-label={mode === "sales" ? "Ventas por jornada de los últimos siete días" : "Pedidos por jornada de los últimos siete días"}>
        <div className="metric-y-axis" aria-hidden="true">
          <span>{mode === "sales" ? money(maxValue) : `${Math.round(maxValue)} ped.`}</span>
          <span>{mode === "sales" ? money(maxValue / 2) : `${Math.floor(maxValue / 2)} ped.`}</span>
          <span>0</span>
        </div>
        <div className="metric-chart-grid">
          {[0, 1, 2].map((line) => <span key={line} className={`metric-gridline metric-gridline-${line}`} />)}
          {days.map((day) => {
            const value = mode === "sales" ? day.sales : day.count;
            const height = value ? Math.max(7, (value / maxValue) * 100) : 3;
            const isTop = Boolean(topDay && day.key === topDay.key);
            return (
              <div key={day.key} className={`metric-day ${isTop ? "is-top" : ""}`} tabIndex={0} aria-label={`${shortDate(day.date)}: ${money(day.sales)}, ${day.count} pedidos`}>
                <div className="metric-tooltip">
                  <p className="metric-tooltip-title">{dayName(day.date)} · {shortDate(day.date)}</p>
                  <p className="mt-1 text-sm font-semibold">{money(day.sales)} · {day.count} {day.count === 1 ? "pedido" : "pedidos"}</p>
                  <p className="metric-tooltip-caption">Productos con más unidades</p>
                  {day.products.length ? day.products.slice(0, 3).map((product) => (
                    <p key={product.name} className="metric-tooltip-row"><span>{product.name}</span><b>{product.qty}×</b></p>
                  )) : <p className="metric-muted text-xs">Sin ventas registradas</p>}
                </div>
                <span className="metric-bar-value">{value ? mode === "sales" ? money(value) : value : "—"}</span>
                <span className="metric-bar-track"><span className="metric-bar" style={{ height: `${height}%` }} /></span>
                <span className="metric-day-label">{dayName(day.date)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <footer className="metric-chart-footer">
        <span><i className="metric-legend-dot is-active" /> {mode === "sales" ? "Ventas registradas" : "Pedidos registrados"}</span>
        <span><i className="metric-legend-dot" /> Sin pedidos registrados</span>
        <span className="metric-chart-summary">{topDay ? `Mayor movimiento: ${dayName(topDay.date)} · ${topDay.count} ${topDay.count === 1 ? "pedido" : "pedidos"}` : "Aún no hay pedidos en este período"}</span>
      </footer>
      <p className="metric-muted mt-2 text-[11px]">Promedio diario: {mode === "sales" ? money(average) : `${average.toFixed(1)} pedidos`} · Pasa el cursor o enfoca una barra para ver el detalle.</p>
    </section>
  );
}

function PaymentPanel({ rows }: { rows: { id: string; label: string; detail: string; amount: number; share: number; tone: string }[] }) {
  return (
    <section className="metric-surface metric-panel" aria-labelledby="payment-title">
      <p className="metric-label">Cómo se pagó</p>
      <h2 id="payment-title" className="metric-heading mt-1">Pagos por método</h2>
      <p className="metric-muted mt-1 text-xs">Método y estado se muestran por separado.</p>
      <div className="mt-5 divide-y metric-divider">
        {rows.map((row) => (
          <div key={row.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between gap-2">
              <div><p className="text-sm font-semibold">{row.label}</p><p className="metric-muted mt-1 text-[11px]">{row.detail}</p></div>
              <div className="text-right"><p className={`text-sm font-bold ${row.tone}`}>{money(row.amount)}</p><p className="metric-muted mt-1 text-[10px]">{row.share}%</p></div>
            </div>
            <div className="metric-progress mt-2"><span className={row.tone} style={{ width: `${row.share}%` }} /></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProductPanel({ orders, metric, setMetric }: { orders: AdminOrder[]; metric: ProductMetric; setMetric: (metric: ProductMetric) => void }) {
  const products = new Map<string, { units: number; revenue: number }>();
  orders.filter((order) => order.status !== "cancelled").forEach((order) => {
    order.items?.forEach((item) => {
      const name = productName(item);
      const current = products.get(name) ?? { units: 0, revenue: 0 };
      current.units += item.qty ?? 0;
      current.revenue += productRevenue(item);
      products.set(name, current);
    });
  });
  const ranking = Array.from(products.entries()).map(([name, values]) => ({ name, ...values }))
    .sort((a, b) => metric === "units" ? b.units - a.units : b.revenue - a.revenue).slice(0, 5);
  const maximum = Math.max(1, ...ranking.map((item) => metric === "units" ? item.units : item.revenue));

  return (
    <section className="metric-surface metric-panel" aria-labelledby="products-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="metric-label">Mix de productos</p><h2 id="products-title" className="metric-heading mt-1">¿Qué se vendió más?</h2><p className="metric-muted mt-1 text-xs">Unidades e ingresos se comparan por separado.</p></div>
        <div className="metric-segment" role="group" aria-label="Ordenar productos">
          <button type="button" aria-pressed={metric === "units"} onClick={() => setMetric("units")}>Unidades</button>
          <button type="button" aria-pressed={metric === "revenue"} onClick={() => setMetric("revenue")}>Ingresos</button>
        </div>
      </div>
      <div className="mt-5">
        {ranking.length ? ranking.map((item, index) => {
          const value = metric === "units" ? item.units : item.revenue;
          return <div key={item.name} className="metric-product-row">
            <span className="metric-rank">{String(index + 1).padStart(2, "0")}</span>
            <div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><span className="truncate text-sm font-semibold">{item.name}</span><span className="shrink-0 text-xs font-semibold">{metric === "units" ? `${item.units} un.` : money(item.revenue)}</span></div><div className="metric-progress mt-2"><span style={{ width: `${(value / maximum) * 100}%` }} /></div></div>
          </div>;
        }) : <div className="metric-empty"><ChartNoAxesColumnIncreasing className="mx-auto h-5 w-5" /><p className="mt-2 text-sm font-medium">Aún no hay detalle de productos en este período.</p><p className="metric-muted mt-1 text-xs">El ranking aparecerá cuando existan ventas con artículos disponibles.</p></div>}
      </div>
    </section>
  );
}

function AcquisitionPanel({ orders }: { orders: AdminOrder[] }) {
  const attributed = orders.filter((order) => order.status !== "cancelled" && order.acquisitionSource);
  const total = orders.filter((order) => order.status !== "cancelled").length;
  const bySource = new Map<Source, { count: number; revenue: number }>();
  attributed.forEach((order) => {
    const source = order.acquisitionSource as Source;
    const current = bySource.get(source) ?? { count: 0, revenue: 0 };
    current.count += 1;
    current.revenue += amount(order);
    bySource.set(source, current);
  });
  const rows = SOURCES.map((source) => ({ ...source, ...(bySource.get(source.id) ?? { count: 0, revenue: 0 }) }));
  return (
    <section className="metric-surface metric-panel" aria-labelledby="acquisition-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="metric-label">Adquisición · origen del pedido</p><h2 id="acquisition-title" className="metric-heading mt-1">¿Desde dónde llegó?</h2><p className="metric-muted mt-1 text-xs">Origen y canal de registro son dimensiones distintas.</p></div>
        <span className="metric-tag">Captura manual en POS</span>
      </div>
      <div className="metric-attribution-summary mt-4">
        <div><span className="metric-label">Pedidos atribuibles</span><p className="mt-1 text-xl font-semibold">{attributed.length}<span className="metric-muted text-sm"> de {total}</span></p></div>
        <div className="text-right"><span className="metric-label">Ventas atribuidas</span><p className="mt-1 text-xl font-semibold">{money(attributed.reduce((sum, order) => sum + amount(order), 0))}</p></div>
      </div>
      <div className="mt-3 divide-y metric-divider">
        {rows.map((row) => <div key={row.id} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span>{row.label}</span><span className="metric-muted text-right">{row.count ? `${row.count} ${row.count === 1 ? "pedido" : "pedidos"} · ${money(row.revenue)}` : "Sin datos"}</span></div>)}
      </div>
      <p className="metric-note mt-3">En POS puedes registrar Instagram, Facebook, WhatsApp, presencial u otro. La campaña o publicación es opcional; todavía no hay conexión con Meta.</p>
    </section>
  );
}

export default function MetricasPage() {
  const { orders, loading: loadingOrders, error: ordersError } = useLiveOrders(tenantId);
  const { expenses, loading: loadingExpenses, error: expensesError } = useLiveExpenses(tenantId);
  const [period, setPeriod] = useState<Period>("today");
  const [channel, setChannel] = useState<Channel>("all");
  const [compare, setCompare] = useState(false);
  const [chartMode, setChartMode] = useState<"sales" | "orders">("sales");
  const [productMetric, setProductMetric] = useState<ProductMetric>("units");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("amon-operations-theme");
    if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);
    const unsubscribe = onAuthStateChanged(auth, (user) => setOperator(user?.email ?? null));
    let active = true;
    void getDoc(doc(db, "tenants", tenantId)).then((snapshot) => {
      if (active && snapshot.exists()) setTenant(snapshot.data() as TenantInfo);
    }).catch(() => undefined);
    const interval = window.setInterval(() => setNowMs(Date.now()), 60000);
    return () => { active = false; unsubscribe(); window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.amonTheme = theme;
    return () => { delete document.documentElement.dataset.amonTheme; };
  }, [theme]);

  function toggleTheme() {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      window.localStorage.setItem("amon-operations-theme", next);
      return next;
    });
  }

  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const range = useMemo(() => rangeFor(period, now, customStart, customEnd), [period, now, customStart, customEnd]);
  const earlierRange = useMemo(() => previousRange(range), [range]);
  const channelOrders = useMemo(() => orders.filter((order) => channel === "all" || order.channel === channel), [orders, channel]);
  const selectedOrders = useMemo(() => channelOrders.filter((order) => within(toDate(order.createdAt), range)), [channelOrders, range]);
  const previousOrders = useMemo(() => channelOrders.filter((order) => within(toDate(order.createdAt), earlierRange)), [channelOrders, earlierRange]);
  const selectedExpenses = useMemo(() => expenses.filter((expense) => within(toDate(expense.occurredAt ?? expense.createdAt), range) && isActiveExpense(expense)), [expenses, range]);
  const trendDays = useMemo<DayPoint[]>(() => {
    const start = getOperationalDayStart(now);
    const dates = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(date.getDate() - (6 - index));
      return date;
    });
    return dates.map((date) => {
      const key = dateKey(date);
      const dailyOrders = channelOrders.filter((order) => order.status !== "cancelled" && toDate(order.createdAt) && dateKey(getOperationalDayStart(toDate(order.createdAt)!)) === key);
      const products = new Map<string, number>();
      dailyOrders.forEach((order) => order.items?.forEach((item) => {
        const name = productName(item);
        products.set(name, (products.get(name) ?? 0) + (item.qty ?? 0));
      }));
      return { key, date, label: dayName(date), sales: dailyOrders.reduce((sum, order) => sum + amount(order), 0), count: dailyOrders.length, products: Array.from(products, ([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty) };
    });
  }, [channelOrders, now]);

  const summary = useMemo(() => {
    const validOrders = selectedOrders.filter((order) => order.status !== "cancelled");
    const sales = validOrders.reduce((sum, order) => sum + amount(order), 0);
    const cashOrders = validOrders.filter((order) => order.paymentMethod === "cash");
    const cash = cashOrders.reduce((sum, order) => sum + amount(order), 0);
    const transferOrders = validOrders.filter((order) => order.paymentMethod === "transfer");
    const confirmedTransfers = transferOrders.filter((order) => order.paymentStatus === "paid");
    const pendingTransfers = transferOrders.filter((order) => order.paymentStatus !== "paid");
    const pendingTransferAmount = pendingTransfers.reduce((sum, order) => sum + amount(order), 0);
    const unclassifiedOrders = validOrders.filter((order) => order.paymentMethod !== "cash" && order.paymentMethod !== "transfer");
    const unclassifiedAmount = unclassifiedOrders.reduce((sum, order) => sum + amount(order), 0);
    const expensesAmount = selectedExpenses.reduce((sum, expense) => sum + (expense.amount ?? 0), 0);
    return {
      validOrders, sales, cash, cashCount: cashOrders.length,
      confirmedTransferAmount: confirmedTransfers.reduce((sum, order) => sum + amount(order), 0),
      confirmedTransferCount: confirmedTransfers.length,
      pendingTransferAmount, pendingTransferCount: pendingTransfers.length,
      unclassifiedAmount, unclassifiedCount: unclassifiedOrders.length,
      averageTicket: validOrders.length ? sales / validOrders.length : 0,
      expensesAmount, net: sales - expensesAmount,
    };
  }, [selectedOrders, selectedExpenses]);
  const previousSummary = useMemo(() => {
    const valid = previousOrders.filter((order) => order.status !== "cancelled");
    const sales = valid.reduce((sum, order) => sum + amount(order), 0);
    const cash = valid.filter((order) => order.paymentMethod === "cash").reduce((sum, order) => sum + amount(order), 0);
    const pendingTransfer = valid.filter((order) => order.paymentMethod === "transfer" && order.paymentStatus !== "paid").reduce((sum, order) => sum + amount(order), 0);
    return { sales, cash, pendingTransfer, count: valid.length, average: valid.length ? sales / valid.length : 0 };
  }, [previousOrders]);
  const paymentTotal = summary.cash + summary.confirmedTransferAmount + summary.pendingTransferAmount + summary.unclassifiedAmount;
  const demoOnly = orders.length > 0 && orders.every(isDemoOrder);
  const pendingAttribution = summary.validOrders.filter((order) => !order.acquisitionSource).length;
  const loading = loadingOrders || loadingExpenses;
  const error = ordersError ?? expensesError;
  const location = [tenant?.location?.commune, tenant?.location?.city].filter(Boolean).join(" · ");

  function comparison(current: number, previous: number) {
    if (!compare) return undefined;
    if (!previous) return { value: current ? "Nuevo" : "—", positive: current ? true : null };
    const difference = Math.round(((current - previous) / previous) * 100);
    return { value: `${difference > 0 ? "+" : ""}${difference}% vs ant.`, positive: difference > 0 ? true : difference < 0 ? false : null };
  }

  const paymentRows = [
    { id: "cash", label: "Efectivo", detail: `${summary.cashCount} ${summary.cashCount === 1 ? "pedido" : "pedidos"} · registrado`, amount: summary.cash, share: percent(summary.cash, paymentTotal), tone: "metric-tone-positive" },
    { id: "transfer-paid", label: "Transferencia confirmada", detail: summary.confirmedTransferCount ? `${summary.confirmedTransferCount} pedidos confirmados` : "Sin pagos confirmados en el período", amount: summary.confirmedTransferAmount, share: percent(summary.confirmedTransferAmount, paymentTotal), tone: "metric-tone-neutral" },
    { id: "transfer-pending", label: "Transferencia pendiente", detail: summary.pendingTransferCount ? `${summary.pendingTransferCount} pedidos · por confirmar` : "Sin transferencias pendientes", amount: summary.pendingTransferAmount, share: percent(summary.pendingTransferAmount, paymentTotal), tone: "metric-tone-warning" },
    ...(summary.unclassifiedAmount > 0 ? [{ id: "other", label: "Otro método / sin clasificar", detail: `${summary.unclassifiedCount} ${summary.unclassifiedCount === 1 ? "pedido" : "pedidos"}`, amount: summary.unclassifiedAmount, share: percent(summary.unclassifiedAmount, paymentTotal), tone: "metric-tone-neutral" }] : []),
  ];

  return (
    <main data-admin-surface="metrics" data-theme={theme} className="metric-root min-h-screen">
      <div className="mx-auto max-w-[1540px] px-4 py-4 sm:px-6 lg:px-8">
        <header className="metric-context mb-5" aria-label="Contexto del negocio">
          <div className="metric-breadcrumb"><span>AMON Shop</span><span>/</span><strong>Métricas</strong></div>
          <div className="metric-context-items">
            <div><span>Negocio</span><strong>{tenant?.name ?? "Cargando tienda…"}</strong><small>Tenant {tenantId.toUpperCase()}</small></div>
            <div><span>Local activo</span><strong>{tenant?.location?.commune ?? "Local no disponible"}</strong><small>{location || "Ubicación no configurada"}</small></div>
            <div><span>Operador</span><strong>{operator ?? "Sesión no disponible"}</strong><small>Acceso verificado · Administrador</small></div>
            <button type="button" className="metric-theme-button" onClick={toggleTheme} aria-label={`Cambiar a modo ${theme === "dark" ? "claro" : "oscuro"}`}>
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              Modo {theme === "dark" ? "claro" : "oscuro"}
            </button>
          </div>
        </header>

        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div><p className="metric-eyebrow">Pulso del negocio</p><h1 className="metric-title mt-1">Métricas</h1><p className="metric-muted mt-1 text-sm">Ventas, pagos y actividad de tu tienda en un solo lugar.</p></div>
          <span className={`metric-tag ${demoOnly ? "metric-tag-demo" : ""}`}>{demoOnly ? "Datos demo · seed local" : "Datos en vivo · Firestore"}</span>
        </div>

        <section className="metric-filter-row mb-4" aria-label="Filtros de métricas">
          <div className="metric-periods" role="group" aria-label="Período">
            {PERIODS.map((item) => <button key={item.id} type="button" aria-pressed={period === item.id} onClick={() => setPeriod(item.id)}>{item.label}</button>)}
            <button type="button" aria-pressed={period === "custom"} onClick={() => setPeriod(period === "custom" ? "today" : "custom")}><CalendarDays className="h-3.5 w-3.5" /> Personalizado</button>
          </div>
          <div className="metric-filters-secondary">
            <label htmlFor="metrics-channel">Canal</label>
            <select id="metrics-channel" className="metric-select" value={channel} onChange={(event) => setChannel(event.target.value as Channel)}>
              <option value="all">Todos los canales</option><option value="web">Web</option><option value="admin_pos">POS</option>
            </select>
            <button type="button" className={`metric-compare ${compare ? "is-selected" : ""}`} onClick={() => setCompare((value) => !value)} aria-pressed={compare}>Comparar: período anterior</button>
          </div>
        </section>
        {period === "custom" && <div className="metric-custom-range mb-4"><label>Desde <input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label><label>Hasta <input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label><span>{shortDate(range.start)} – {shortDate(range.end)}</span></div>}

        {!loading && demoOnly && summary.validOrders.length <= 5 && <div className="metric-caution mb-4"><CircleHelp className="mt-0.5 h-4 w-4 shrink-0" /><p><strong>Lectura responsable:</strong> este período contiene {summary.validOrders.length} pedido{summary.validOrders.length === 1 ? "" : "s"} de muestra. La comparación por día y producto todavía no permite concluir tendencias.</p></div>}

        {loading ? <div className="metric-surface metric-loading">Cargando métricas de la tienda…</div> : error ? (
          <div role="alert" className="metric-error"><p className="font-semibold">No pudimos cargar las métricas.</p><p className="mt-1">{error.message.toLowerCase().includes("failed to fetch") ? "Sin conexión con Firestore. Comprueba que los emuladores estén activos." : error.message}</p></div>
        ) : <>
          <section className="metric-kpis mb-4" aria-label="Resumen del período">
            <KpiCard label="Ventas registradas" value={money(summary.sales)} detail="Total de pedidos no anulados · período seleccionado" helper="Suma de pedidos no anulados; no significa que todos estén cobrados." tone="accent" comparison={comparison(summary.sales, previousSummary.sales)} />
            <KpiCard label="Efectivo registrado" value={money(summary.cash)} detail={`${summary.cashCount} ${summary.cashCount === 1 ? "pedido" : "pedidos"} con efectivo · validar con cierre de caja`} helper="Suma las ventas registradas con método efectivo. Validar contra el cierre de caja." comparison={comparison(summary.cash, previousSummary.cash)} />
            <KpiCard label="Transferencia pendiente" value={money(summary.pendingTransferAmount)} detail={`${summary.pendingTransferCount} ${summary.pendingTransferCount === 1 ? "pedido" : "pedidos"} · por confirmar`} helper="Transferencias que aún no figuran como pagadas." tone="warning" comparison={comparison(summary.pendingTransferAmount, previousSummary.pendingTransfer)} />
            <KpiCard label="Pedidos · ticket promedio" value={`${summary.validOrders.length} · ${money(summary.averageTicket)}`} detail="Pedidos no anulados · muestra del período" helper="El ticket promedio usa pedidos no anulados del período." comparison={comparison(summary.validOrders.length, previousSummary.count)} />
          </section>

          <section className="metric-primary-grid mb-4">
            <SalesTrend days={trendDays} mode={chartMode} setMode={setChartMode} />
            <PaymentPanel rows={paymentRows} />
          </section>

          <section className="metric-secondary-grid mb-4">
            <ProductPanel orders={selectedOrders} metric={productMetric} setMetric={setProductMetric} />
            <AcquisitionPanel orders={selectedOrders} />
          </section>

          <section className="metric-smart-panel" aria-labelledby="smart-title">
            <div className="metric-smart-mark">A</div>
            <div className="min-w-0 flex-1"><p className="metric-label">Observación del período</p><h2 id="smart-title" className="metric-heading mt-1">AMON Finanzas Smart</h2>
              <p className="metric-smart-copy mt-2">{summary.pendingTransferAmount > 0 ? <>Hay <strong>{money(summary.pendingTransferAmount)} en transferencia pendiente</strong>. </> : <>No se detectan transferencias pendientes en este período. </>}{demoOnly && summary.validOrders.length <= 5 ? "La muestra todavía es pequeña para identificar días o productos con rendimiento consistente." : `Se registran ${money(summary.expensesAmount)} en gastos activos y un neto operacional preliminar de ${money(summary.net)}.`}</p>
              <p className="metric-muted mt-3 text-[11px]">Basado en pedidos y gastos · sin proyecciones ni conexión con Meta · {pendingAttribution} pedido{pendingAttribution === 1 ? "" : "s"} sin origen</p>
            </div>
            <div className="metric-smart-icon"><Users className="h-5 w-5" /></div>
          </section>
          <footer className="metric-footer">Actualizado en vivo desde pedidos y gastos · Jornada operacional 05:00–05:00{demoOnly ? " · Los pedidos demo están identificados para no confundirlos con ventas reales." : ""}</footer>
        </>}
      </div>
    </main>
  );
}
