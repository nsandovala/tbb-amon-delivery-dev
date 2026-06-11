"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { useLiveOrders } from "../../hooks/use-live-orders";
import { updateOrderStatusApi } from "../../lib/api/orders";
import { db } from "../../lib/firebase/client";
import type { AdminOrder, OrderStatus } from "../../lib/firebase/queries/orders";

const tenantId = "tbb";

const LEGAL_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  queued: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["on_the_way", "delivered", "cancelled"],
  on_the_way: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

const ACTIVE_ORDER_STATUSES = new Set<OrderStatus>(["queued", "preparing", "ready", "on_the_way"]);

function getLegalNextStatuses(current?: OrderStatus): OrderStatus[] {
  if (!current) return [];
  return LEGAL_TRANSITIONS[current] ?? [];
}

type ProductNameMap = Record<string, string>;
type StatusFilter = OrderStatus | "all";

function formatStatusLabel(status?: string) {
  switch (status) {
    case "queued":      return "En cola";
    case "preparing":   return "Preparando";
    case "ready":       return "Listo";
    case "on_the_way":  return "En reparto";
    case "delivered":   return "Entregado";
    case "cancelled":   return "Cancelado";
    default:            return "Sin definir";
  }
}

function getOrderDisplayLabel(order: AdminOrder) {
  if (order.channel === "admin_pos")    return "Pedido POS";
  if (order.channel === "web")          return "Pedido Web";
  if (order.channel === "whatsapp")     return "Pedido WhatsApp";
  if (order.channel === "marketplace")  return "Marketplace";
  return "Canal sin definir";
}

function statusStyles(status: string) {
  switch (status) {
    case "queued":      return "bg-yellow-500/12 text-yellow-300 border-yellow-500/20";
    case "preparing":   return "bg-orange-500/12 text-orange-300 border-orange-500/20";
    case "ready":       return "bg-sky-500/12 text-sky-300 border-sky-500/20";
    case "on_the_way":  return "bg-violet-500/12 text-violet-300 border-violet-500/20";
    case "delivered":   return "bg-emerald-500/12 text-emerald-300 border-emerald-500/20";
    case "cancelled":   return "bg-red-500/12 text-red-300 border-red-500/20";
    default:            return "bg-white/5 text-neutral-300 border-white/10";
  }
}

function formatFulfillment(type?: string) {
  if (type === "delivery") return "Delivery";
  if (type === "pickup")   return "Retiro";
  return "Sin definir";
}

function formatPaymentMethod(method?: string) {
  switch (method) {
    case "cash":      return "Efectivo";
    case "card":      return "Tarjeta";
    case "transfer":  return "Transferencia";
    case "pending":   return "Pendiente";
    default:          return method || "Sin definir";
  }
}

function formatChannelLabel(channel?: string) {
  return getOrderDisplayLabel({ channel } as AdminOrder);
}

function formatMoney(value?: number) {
  return `$${(value ?? 0).toLocaleString("es-CL")}`;
}

function toSafeDate(value?: unknown) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "object" && value !== null) {
    if (
      "toDate" in value &&
      typeof (value as { toDate?: () => Date }).toDate === "function"
    ) {
      const parsed = (value as { toDate: () => Date }).toDate();
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    if ("seconds" in value && typeof (value as { seconds?: number }).seconds === "number") {
      const parsed = new Date((value as { seconds: number }).seconds * 1000);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

const DAY_CUTOFF_HOUR = 5;
// TODO: mover a tenants/{tenantId}/settings/store cuando exista configuración por tenant.

function getOperationalDayStart(now: Date, cutoffHour = DAY_CUTOFF_HOUR): Date {
  const start = new Date(now);
  start.setHours(cutoffHour, 0, 0, 0);
  if (start.getTime() > now.getTime()) {
    start.setDate(start.getDate() - 1);
  }
  return start;
}

function formatReadableTime(date: Date | null) {
  if (!date) return "Sin hora";
  return date.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

function formatReadableDate(date: Date | null) {
  if (!date) return "Sin fecha";
  return date.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

function formatElapsedTime(date: Date | null, nowTs: number) {
  if (!date) return "Sin registro";

  const diffMs = Math.max(nowTs - date.getTime(), 0);
  const totalMinutes = Math.floor(diffMs / 60000);

  if (totalMinutes < 1) return "Recién ingresado";
  if (totalMinutes < 60) return `Hace ${totalMinutes} min`;

  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  if (totalHours < 24) {
    return remainingMinutes > 0
      ? `Hace ${totalHours}h ${remainingMinutes}m`
      : `Hace ${totalHours}h`;
  }

  const days = Math.floor(totalHours / 24);
  const remainingHours = totalHours % 24;
  return remainingHours > 0 ? `Hace ${days}d ${remainingHours}h` : `Hace ${days}d`;
}

function getItemCount(order: AdminOrder) {
  return order.items?.reduce((acc, item) => acc + (item.qty || 0), 0) ?? 0;
}

function prettifyProductId(productId?: string) {
  if (!productId) return "Producto";
  return productId
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function OrderCard({
  order,
  selected,
  onSelect,
  onChangeStatus,
  updatingIds,
  nowTs,
}: {
  order: AdminOrder;
  selected: boolean;
  onSelect: () => void;
  onChangeStatus: (orderId: string, nextStatus: OrderStatus) => Promise<void>;
  updatingIds: Set<string>;
  nowTs: number;
}) {
  const itemCount = getItemCount(order);
  const createdAt = toSafeDate(order.createdAt);
  const createdAtTime = formatReadableTime(createdAt);
  const elapsedTime = formatElapsedTime(createdAt, nowTs);
  const isUpdating = updatingIds.has(order.id);
  const legalNextStatuses = getLegalNextStatuses(order.status);

  return (
    <button
      onClick={onSelect}
      className={[
        "w-full rounded-2xl border p-4 text-left transition-all",
        selected
          ? "border-emerald-400/25 bg-emerald-400/[0.06] shadow-[0_0_0_1px_rgba(0,255,156,0.06),0_0_24px_rgba(0,255,156,0.08)]"
          : "border-white/10 bg-[#101010] hover:border-white/16 hover:bg-[#121212]",
      ].join(" ")}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold text-white">
                #{order.id.slice(0, 6).toUpperCase()}
              </span>
              <span
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] ${statusStyles(order.status ?? "")}`}
              >
                {formatStatusLabel(order.status)}
              </span>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium text-white">
                {order.customer?.name || "Sin nombre"}
              </p>
              <p className="text-sm text-neutral-400">
                {order.customer?.phone || "Sin teléfono"}
              </p>
              {order.customer?.email ? (
                <p className="text-xs text-neutral-500">{order.customer.email}</p>
              ) : null}
              {order.customer?.address ? (
                <p className="line-clamp-2 text-xs text-neutral-500">
                  {order.customer.address}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-neutral-500">
                <span>{createdAtTime}</span>
                <span className="text-neutral-700">•</span>
                <span>{elapsedTime}</span>
              </div>
            </div>
          </div>

          <div className="text-right">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
              {formatChannelLabel(order.channel)} • {formatFulfillment(order.fulfillmentType)}
            </p>
            <p className="mt-1 text-2xl font-bold text-emerald-400">
              {formatMoney(order.totals?.total)}
            </p>
            <p className="mt-1 text-sm text-neutral-400">
              {formatPaymentMethod(order.paymentMethod)} • {itemCount} {itemCount === 1 ? "item" : "items"}
            </p>
          </div>
        </div>

        {legalNextStatuses.length === 0 ? (
          <div className="rounded-xl border border-white/6 bg-white/[0.02] p-3">
            <p className="mb-1 text-xs uppercase tracking-[0.16em] text-neutral-500">
              Estado final
            </p>
            <p className="text-xs text-neutral-500">
              Este pedido ya no acepta cambios desde operación normal.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-white/6 bg-white/[0.02] p-3">
            <p className="mb-2 text-xs uppercase tracking-[0.16em] text-neutral-500">
              Cambiar estado
            </p>
            <div className="flex flex-wrap gap-2">
              {legalNextStatuses.map((nextStatus) => (
                <button
                  type="button"
                  key={nextStatus}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (isUpdating) return;
                    void onChangeStatus(order.id, nextStatus);
                  }}
                  disabled={isUpdating}
                  className={[
                    "rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition-all",
                    isUpdating
                      ? "cursor-not-allowed border-white/10 bg-white/[0.03] text-neutral-500 opacity-60"
                      : "border-white/10 bg-white/[0.03] text-neutral-300 hover:border-white/20 hover:bg-white/[0.05] hover:text-white",
                  ].join(" ")}
                >
                  {formatStatusLabel(nextStatus)}
                </button>
              ))}
            </div>
            {isUpdating ? (
              <p className="mt-3 text-xs text-cyan-300">Actualizando...</p>
            ) : null}
          </div>
        )}
      </div>
    </button>
  );
}

export default function OrdersPage() {
  const { orders, loading, error: ordersError } = useLiveOrders(tenantId);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [productNames, setProductNames] = useState<ProductNameMap>({});
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [pendingStatusChange, setPendingStatusChange] = useState<{ orderId: string; status: OrderStatus } | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const snapshot = await getDocs(collection(db, `tenants/${tenantId}/products`));
        const nextMap: ProductNameMap = {};
        snapshot.forEach((doc) => {
          const data = doc.data() as { name?: string };
          nextMap[doc.id] = data.name || prettifyProductId(doc.id);
        });
        setProductNames(nextMap);
      } catch (error) {
        console.error("Error cargando nombres de productos:", error);
      }
    };
    void loadProducts();
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowTs(Date.now()), 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const timeoutId = window.setTimeout(() => setFeedback(null), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [feedback]);

  useEffect(() => {
    if (!pendingStatusChange) return;

    const targetOrder = orders.find((order) => order.id === pendingStatusChange.orderId);
    if (!targetOrder || targetOrder.status !== pendingStatusChange.status) return;

    const { orderId: confirmedId, status: confirmedStatus } = pendingStatusChange;
    setFeedback({
      type: "success",
      message: `Pedido #${confirmedId.slice(0, 6).toUpperCase()} actualizado a ${formatStatusLabel(confirmedStatus)}.`,
    });
    setPendingStatusChange(null);
    setUpdatingIds((prev) => {
      const next = new Set(prev);
      next.delete(confirmedId);
      return next;
    });
  }, [orders, pendingStatusChange]);

  useEffect(() => {
    if (!pendingStatusChange) return;

    const { orderId: pendingId } = pendingStatusChange;
    const timeoutId = window.setTimeout(() => {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(pendingId);
        return next;
      });
      setPendingStatusChange(null);
      setFeedback({
        type: "error",
        message: "El servidor no confirmó el cambio a tiempo. Recarga si el estado no se actualizó.",
      });
    }, 8000);

    return () => window.clearTimeout(timeoutId);
  }, [pendingStatusChange]);

  const operationalDayStart = useMemo(
    () => getOperationalDayStart(new Date(nowTs)),
    [nowTs]
  );

  const operationalOrders = useMemo(() => {
    const startMs = operationalDayStart.getTime();
    return orders.filter((order) => {
      const createdAt = toSafeDate(order.createdAt);
      return createdAt ? createdAt.getTime() >= startMs : false;
    });
  }, [orders, operationalDayStart]);

  const {
    totalVisible,
    queued,
    preparing,
    ready,
    onTheWay,
    delivered,
    cancelled,
  } = useMemo(() => {
    const metrics = { totalVisible: operationalOrders.length, queued: 0, preparing: 0, ready: 0, onTheWay: 0, delivered: 0, cancelled: 0 };
    operationalOrders.forEach((order) => {
      switch (order.status) {
        case "queued":    metrics.queued += 1; break;
        case "preparing": metrics.preparing += 1; break;
        case "ready":     metrics.ready += 1; break;
        case "on_the_way": metrics.onTheWay += 1; break;
        case "delivered": metrics.delivered += 1; break;
        case "cancelled": metrics.cancelled += 1; break;
        default: break;
      }
    });
    return metrics;
  }, [operationalOrders]);

  const displayedOrders = useMemo(() => {
    let result = orders as AdminOrder[];

    if (statusFilter !== "all") {
      result = result.filter((o) => o.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (o) =>
          o.id.toLowerCase().includes(q) ||
          o.customer?.name?.toLowerCase().includes(q) ||
          o.customer?.phone?.toLowerCase().includes(q)
      );
    }

    return [...result].sort((a, b) => {
      const aActive = ACTIVE_ORDER_STATUSES.has(a.status as OrderStatus);
      const bActive = ACTIVE_ORDER_STATUSES.has(b.status as OrderStatus);
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      return 0;
    });
  }, [orders, statusFilter, searchQuery]);

  const selectedOrder = useMemo(() => {
    if (!displayedOrders.length) return null;
    const found = displayedOrders.find((order) => order.id === selectedOrderId);
    return found ?? displayedOrders[0];
  }, [displayedOrders, selectedOrderId]);

  const handleChangeStatus = async (orderId: string, nextStatus: OrderStatus) => {
    if (updatingIds.has(orderId)) return;

    try {
      setUpdatingIds((prev) => new Set([...prev, orderId]));
      setPendingStatusChange({ orderId, status: nextStatus });
      await updateOrderStatusApi(orderId, nextStatus);
    } catch (error) {
      console.error("Error actualizando estado:", error);
      setPendingStatusChange(null);
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });

      const rawMessage = error instanceof Error ? error.message : "";
      const humanMessage = rawMessage.toLowerCase().includes("failed to fetch")
        ? "Sin conexión al servidor. Revisa que el emulador o backend esté activo."
        : rawMessage.toLowerCase().includes("illegal transition")
        ? "Este cambio de estado no está permitido por el flujo operativo."
        : rawMessage || "No pudimos actualizar el estado del pedido.";

      setFeedback({ type: "error", message: humanMessage });
    }
  };

  const resolveProductName = (productId?: string) => {
    if (!productId) return "Producto";
    return productNames[productId] || prettifyProductId(productId);
  };

  const selectedOrderCreatedAt = toSafeDate(selectedOrder?.createdAt);

  const filterTabs: { value: StatusFilter; label: string; count: number; color: string }[] = [
    { value: "all",        label: "Todos",      count: totalVisible, color: "text-white" },
    { value: "queued",     label: "En cola",    count: queued,       color: "text-yellow-300" },
    { value: "preparing",  label: "Preparando", count: preparing,    color: "text-orange-300" },
    { value: "ready",      label: "Listos",     count: ready,        color: "text-sky-300" },
    { value: "on_the_way", label: "En reparto", count: onTheWay,     color: "text-violet-300" },
    { value: "delivered",  label: "Entregados", count: delivered,    color: "text-emerald-300" },
    { value: "cancelled",  label: "Cancelados", count: cancelled,    color: "text-red-300" },
  ];

  return (
    <main className="min-h-screen bg-[#0B0B0B] text-white">
      <div className="mx-auto max-w-[1600px] px-6 py-8">

        {/* Header + métricas */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.25em] text-emerald-400/80">
              Centro de operación
            </p>
            <h1 className="text-4xl font-black tracking-tight text-white">
              Pedidos en vivo
            </h1>
            <p className="mt-2 text-sm text-neutral-400">
              Cola operativa del tenant TBB en tiempo real.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.15em] text-neutral-500">Total</p>
              <p className="mt-1 text-2xl font-bold text-white">{totalVisible}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.15em] text-neutral-500">En cola</p>
              <p className="mt-1 text-2xl font-bold text-yellow-300">{queued}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.15em] text-neutral-500">Preparando</p>
              <p className="mt-1 text-2xl font-bold text-orange-300">{preparing}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.15em] text-neutral-500">Listos</p>
              <p className="mt-1 text-2xl font-bold text-sky-300">{ready}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.15em] text-neutral-500">En reparto</p>
              <p className="mt-1 text-2xl font-bold text-violet-300">{onTheWay}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.15em] text-neutral-500">Entregados</p>
              <p className="mt-1 text-2xl font-bold text-emerald-300">{delivered}</p>
            </div>
          </div>
        </div>

        {/* Filtros de estado + búsqueda */}
        <div className="mb-5 space-y-2">
          <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {filterTabs.map((tab) => {
              const active = statusFilter === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setStatusFilter(tab.value)}
                  className={[
                    "shrink-0 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition-all",
                    active
                      ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300 shadow-[0_0_0_1px_rgba(0,255,156,0.04),0_0_16px_rgba(0,255,156,0.06)]"
                      : "border-white/10 bg-white/[0.03] text-neutral-400 hover:border-white/20 hover:text-white",
                  ].join(" ")}
                >
                  {tab.label}
                  <span className={["tabular-nums font-bold", active ? "text-emerald-300" : tab.color].join(" ")}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex justify-start xl:justify-end">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar cliente, teléfono o ID..."
              className="w-full max-w-sm rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-neutral-500 focus:border-emerald-400/30"
            />
          </div>
        </div>

        {/* Feedback banner */}
        {feedback ? (
          <div
            className={[
              "mb-6 rounded-2xl border px-4 py-3 text-sm",
              feedback.type === "success"
                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                : "border-red-400/20 bg-red-400/10 text-red-100",
            ].join(" ")}
          >
            {feedback.message}
          </div>
        ) : null}

        {/* Estados principales */}
        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-[#101010] p-6 text-neutral-400">
            Cargando pedidos...
          </div>
        ) : ordersError ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-6 text-sm text-red-300">
            <p className="font-semibold">Error cargando pedidos</p>
            <p className="mt-1 text-red-400/80">
              {ordersError.message.toLowerCase().includes("failed to fetch")
                ? "Sin conexión al servidor. Revisa que el emulador o backend esté activo."
                : ordersError.message}
            </p>
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-[#101010] p-10 text-center text-neutral-500">
            No hay pedidos aún.
          </div>
        ) : displayedOrders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-[#101010] px-6 py-8 text-center">
            <p className="text-sm font-medium text-neutral-400">Sin resultados</p>
            <p className="mt-1 text-xs text-neutral-500">
              No hay pedidos para este filtro o búsqueda.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_380px]">
            <section className="grid auto-rows-min gap-3 content-start">
              {displayedOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  selected={selectedOrder?.id === order.id}
                  onSelect={() => setSelectedOrderId(order.id)}
                  onChangeStatus={handleChangeStatus}
                  updatingIds={updatingIds}
                  nowTs={nowTs}
                />
              ))}
            </section>

            <aside className="h-fit rounded-3xl border border-white/10 bg-[#101010] p-5 xl:sticky xl:top-6">
              {selectedOrder ? (
                <div className="space-y-5">

                  {/* Encabezado detalle */}
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">
                      Detalle
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <h2 className="text-2xl font-black text-white">
                        #{selectedOrder.id.slice(0, 6).toUpperCase()}
                      </h2>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] ${statusStyles(selectedOrder.status ?? "")}`}
                      >
                        {formatStatusLabel(selectedOrder.status)}
                      </span>
                    </div>
                  </div>

                  {/* Cliente */}
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Cliente</p>
                    <p className="mt-3 text-base font-semibold text-white">
                      {selectedOrder.customer?.name || "Sin nombre"}
                    </p>
                    <p className="mt-1 text-sm text-neutral-400">
                      {selectedOrder.customer?.phone || "Sin teléfono"}
                    </p>
                    {selectedOrder.customer?.email ? (
                      <p className="mt-1 text-sm text-neutral-400">
                        {selectedOrder.customer.email}
                      </p>
                    ) : null}
                    {selectedOrder.customer?.address ? (
                      <p className="mt-3 text-sm text-neutral-400">
                        {selectedOrder.customer.address}
                      </p>
                    ) : selectedOrder.fulfillmentType === "pickup" ? (
                      <p className="mt-3 text-xs text-neutral-500">Retiro en tienda</p>
                    ) : (
                      <p className="mt-3 text-xs text-neutral-500">Sin dirección</p>
                    )}
                    {selectedOrder.customer?.notes ? (
                      <p className="mt-3 text-sm text-neutral-500">
                        Nota: {selectedOrder.customer.notes}
                      </p>
                    ) : null}
                  </div>

                  {/* Operación */}
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Operación</p>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Canal</span>
                        <span className="text-white">{formatChannelLabel(selectedOrder.channel)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Entrega</span>
                        <span className="text-white">{formatFulfillment(selectedOrder.fulfillmentType)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Pago</span>
                        <span className="text-white">{formatPaymentMethod(selectedOrder.paymentMethod)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Monto</span>
                        <span className="font-semibold text-emerald-400">{formatMoney(selectedOrder.totals?.total)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Fecha</span>
                        <span className="text-white">{formatReadableDate(selectedOrderCreatedAt)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Hora</span>
                        <span className="text-white">{formatReadableTime(selectedOrderCreatedAt)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Antigüedad</span>
                        <span className="text-white">{formatElapsedTime(selectedOrderCreatedAt, nowTs)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Items */}
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Items</p>
                    <div className="mt-3 space-y-3">
                      {selectedOrder.items?.map((item, index) => (
                        <div
                          key={`${item.productId}-${index}`}
                          className="flex items-center justify-between gap-3 rounded-xl border border-white/6 bg-black/20 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-white">
                              {resolveProductName(item.productId)}
                            </p>
                            <p className="text-xs text-neutral-500">
                              {item.qty} × {formatMoney(item.unitPrice)}
                            </p>
                          </div>
                          <p className="text-sm font-bold text-emerald-400">
                            {formatMoney((item.unitPrice ?? 0) * (item.qty ?? 0))}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Totales */}
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Totales CLP</p>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Subtotal</span>
                        <span className="text-white">{formatMoney(selectedOrder.totals?.subtotal)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Delivery</span>
                        <span className="text-white">{formatMoney(selectedOrder.totals?.delivery)}</span>
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-white/6 pt-3">
                        <span className="text-base font-semibold text-white">Total</span>
                        <span className="text-2xl font-black text-emerald-400">
                          {formatMoney(selectedOrder.totals?.total)}
                        </span>
                      </div>
                    </div>
                  </div>

                </div>
              ) : null}
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
