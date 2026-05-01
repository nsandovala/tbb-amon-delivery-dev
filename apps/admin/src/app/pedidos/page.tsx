"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { useLiveOrders } from "../../hooks/use-live-orders";
import { updateOrderStatusApi } from "../../lib/api/orders";
import { db } from "../../lib/firebase/client";
import type { AdminOrder, OrderStatus } from "../../lib/firebase/queries/orders";

const tenantId = "tbb";

const STATUS_OPTIONS: OrderStatus[] = [
  "queued",
  "preparing",
  "ready",
  "on_the_way",
  "delivered",
  "cancelled",
];

type ProductNameMap = Record<string, string>;
function getOrderDisplayLabel(order: AdminOrder) {
  if (order.channel === "admin_pos") return "Pedido POS";
  if (order.channel === "own") return "Pedido Web";
  return "Pedido";
}

function statusLabel(status: string) {
  switch (status) {
    case "queued":
      return "En cola";
    case "preparing":
      return "Preparando";
    case "ready":
      return "Listo";
    case "on_the_way":
      return "En camino";
    case "delivered":
      return "Entregado";
    case "cancelled":
      return "Cancelado";
    default:
      return status;
  }
}

function statusStyles(status: string) {
  switch (status) {
    case "queued":
      return "bg-yellow-500/12 text-yellow-300 border-yellow-500/20";
    case "preparing":
      return "bg-orange-500/12 text-orange-300 border-orange-500/20";
    case "ready":
      return "bg-sky-500/12 text-sky-300 border-sky-500/20";
    case "on_the_way":
      return "bg-violet-500/12 text-violet-300 border-violet-500/20";
    case "delivered":
      return "bg-emerald-500/12 text-emerald-300 border-emerald-500/20";
    case "cancelled":
      return "bg-red-500/12 text-red-300 border-red-500/20";
    default:
      return "bg-white/5 text-neutral-300 border-white/10";
  }
}

function formatChannel(channel?: string) {
  switch (channel) {
    case "admin_pos":
      return "POS";
    case "own":
      return "Web";
    default:
      return channel || "Sin definir";
  }
}

function formatFulfillment(type?: string) {
  if (type === "delivery") return "Delivery";
  if (type === "pickup") return "Retiro";
  return "Sin definir";
}

function formatPaymentMethod(method?: string) {
  switch (method) {
    case "cash":
      return "Efectivo";
    case "card":
      return "Tarjeta";
    case "transfer":
      return "Transferencia";
    case "pending":
      return "Pendiente";
    default:
      return method || "Sin definir";
  }
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

function formatReadableTime(date: Date | null) {
  if (!date) return "Sin hora";
  return date.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatReadableDate(date: Date | null) {
  if (!date) return "Sin fecha";
  return date.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
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
  updatingId,
  nowTs,
}: {
  order: AdminOrder;
  selected: boolean;
  onSelect: () => void;
  onChangeStatus: (orderId: string, nextStatus: OrderStatus) => Promise<void>;
  updatingId: string | null;
  nowTs: number;
}) {
  const itemCount = getItemCount(order);
  const createdAt = toSafeDate(order.createdAt);
  const createdAtTime = formatReadableTime(createdAt);
  const elapsedTime = formatElapsedTime(createdAt, nowTs);

  return (
    <button
      onClick={onSelect}
      className={[
        "w-full rounded-2xl border p-5 text-left transition-all",
        selected
          ? "border-emerald-400/25 bg-emerald-400/[0.06] shadow-[0_0_0_1px_rgba(0,255,156,0.06),0_0_24px_rgba(0,255,156,0.08)]"
          : "border-white/10 bg-[#101010] hover:border-white/16 hover:bg-[#121212]",
      ].join(" ")}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold text-white">
                #{order.id.slice(0, 6).toUpperCase()}
              </span>

              <span
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] ${statusStyles(
                  order.status ?? ""
                )}`}
              >
                {statusLabel(order.status ?? "")}
              </span>

              {/* Placeholder para badge de riesgo futuro */}
              {(() => {
                const risk = (order as unknown as Record<string, string | undefined>).riskLevel;
                if (!risk) return null;
                return (
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] ${
                      risk === "high"
                        ? "bg-red-500/12 text-red-300 border-red-500/20"
                        : risk === "medium"
                          ? "bg-amber-500/12 text-amber-300 border-amber-500/20"
                          : "bg-blue-500/12 text-blue-300 border-blue-500/20"
                    }`}
                  >
                    Riesgo {risk === "high" ? "alto" : risk === "medium" ? "medio" : "bajo"}
                  </span>
                );
              })()}
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium text-white">
                {order.customer?.name || "Sin nombre"}
              </p>
              <p className="text-sm text-neutral-400">
                {order.customer?.phone || "Sin teléfono"}
              </p>
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
              {formatFulfillment(order.fulfillmentType)}
            </p>
            <p className="mt-1 text-2xl font-bold text-emerald-400">
              {formatMoney(order.totals?.total)}
            </p>
            <p className="mt-1 text-sm text-neutral-400">
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-white/6 bg-white/[0.02] p-3">
          <p className="mb-2 text-xs uppercase tracking-[0.16em] text-neutral-500">
            Cambiar estado
          </p>

          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((status) => {
              const active = order.status === status;
              const disabled = updatingId === order.id;

              return (
                <span
                  key={status}
                  onClick={(event) => {
                    event.stopPropagation();
                    void onChangeStatus(order.id, status);
                  }}
                  className={[
                    "cursor-pointer rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition-all",
                    active
                      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                      : "border-white/10 bg-white/[0.03] text-neutral-300 hover:border-white/20 hover:bg-white/[0.05] hover:text-white",
                    disabled ? "pointer-events-none opacity-60" : "",
                  ].join(" ")}
                >
                  {statusLabel(status)}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </button>
  );
}

export default function OrdersPage() {
  const { orders, loading } = useLiveOrders(tenantId);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [productNames, setProductNames] = useState<ProductNameMap>({});
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [statusFeedback, setStatusFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

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
    if (!statusFeedback) return;
    const timer = setTimeout(() => setStatusFeedback(null), 3000);
    return () => clearTimeout(timer);
  }, [statusFeedback]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowTs(Date.now());
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, []);

  const selectedOrder = useMemo(() => {
    if (!orders.length) return null;
    const found = orders.find((order) => order.id === selectedOrderId);
    return found ?? orders[0];
  }, [orders, selectedOrderId]);

  const {
    totalVisible,
    queued,
    preparing,
    ready,
    onTheWay,
    delivered,
    cancelled,
    totalVentasCLP,
    trackedTotal,
    hasStatusMismatch,
  } = useMemo(() => {
    const metrics = {
      totalVisible: orders.length,
      queued: 0,
      preparing: 0,
      ready: 0,
      onTheWay: 0,
      delivered: 0,
      cancelled: 0,
      totalVentasCLP: 0,
    };

    orders.forEach((order) => {
      switch (order.status) {
        case "queued":
          metrics.queued += 1;
          break;
        case "preparing":
          metrics.preparing += 1;
          break;
        case "ready":
          metrics.ready += 1;
          break;
        case "on_the_way":
          metrics.onTheWay += 1;
          break;
        case "delivered":
          metrics.delivered += 1;
          metrics.totalVentasCLP += order.totals?.total ?? 0;
          break;
        case "cancelled":
          metrics.cancelled += 1;
          break;
        default:
          break;
      }
    });

    const trackedTotal =
      metrics.queued +
      metrics.preparing +
      metrics.ready +
      metrics.onTheWay +
      metrics.delivered +
      metrics.cancelled;

    return {
      ...metrics,
      trackedTotal,
      hasStatusMismatch: trackedTotal !== metrics.totalVisible,
    };
  }, [orders]);

  const handleChangeStatus = async (
    orderId: string,
    nextStatus: OrderStatus
  ) => {
    try {
      setUpdatingId(orderId);
      await updateOrderStatusApi(orderId, nextStatus);
      setStatusFeedback({
        type: "success",
        message: `Pedido #${orderId.slice(0, 6).toUpperCase()} → ${statusLabel(nextStatus)}`,
      });
    } catch (error) {
      console.error("Error actualizando estado:", error);
      setStatusFeedback({
        type: "error",
        message: `Error: ${error instanceof Error ? error.message : "Transición inválida"}`,
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const resolveProductName = (productId?: string) => {
    if (!productId) return "Producto";
    return productNames[productId] || prettifyProductId(productId);
  };

  const selectedOrderCreatedAt = toSafeDate(selectedOrder?.createdAt);

  return (
    <main className="min-h-screen bg-[#0B0B0B] text-white">
      <div className="mx-auto max-w-[1600px] px-6 py-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
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

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.15em] text-neutral-500">
                Total visible
              </p>
              <p className="mt-1 text-2xl font-bold text-white">{totalVisible}</p>
            </div>

            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.15em] text-emerald-400/70">
                Ventas hoy
              </p>
              <p className="mt-1 text-lg font-bold text-emerald-400">
                {formatMoney(totalVentasCLP)}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.15em] text-neutral-500">
                En cola
              </p>
              <p className="mt-1 text-2xl font-bold text-yellow-300">{queued}</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.15em] text-neutral-500">
                Preparando
              </p>
              <p className="mt-1 text-2xl font-bold text-orange-300">{preparing}</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.15em] text-neutral-500">
                Listo
              </p>
              <p className="mt-1 text-2xl font-bold text-sky-300">{ready}</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.15em] text-neutral-500">
                En camino
              </p>
              <p className="mt-1 text-2xl font-bold text-violet-300">{onTheWay}</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.15em] text-neutral-500">
                Entregados
              </p>
              <p className="mt-1 text-2xl font-bold text-emerald-300">{delivered}</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.15em] text-neutral-500">
                Cancelados
              </p>
              <p className="mt-1 text-2xl font-bold text-red-300">{cancelled}</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-[#101010] p-6 text-neutral-400">
            Cargando pedidos...
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-[#101010] p-10 text-center text-neutral-500">
            No hay pedidos aún.
          </div>
        ) : (
          <div className="space-y-4">
            {statusFeedback && (
              <div
                className={`rounded-2xl border px-5 py-3 text-sm font-medium transition-all ${
                  statusFeedback.type === "success"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border-red-500/30 bg-red-500/10 text-red-300"
                }`}
              >
                {statusFeedback.message}
              </div>
            )}
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_380px]">
            <section className="grid gap-4">
              {hasStatusMismatch ? (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  Hay una inconsistencia entre el total visible ({totalVisible}) y
                  los estados operativos contabilizados ({trackedTotal}). `ready`
                  se incluye en la validación aunque no se muestre en las cards
                  superiores.
                </div>
              ) : null}

              {orders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  selected={selectedOrder?.id === order.id}
                  onSelect={() => setSelectedOrderId(order.id)}
                  onChangeStatus={handleChangeStatus}
                  updatingId={updatingId}
                  nowTs={nowTs}
                />
              ))}
            </section>

            <aside className="h-fit rounded-3xl border border-white/10 bg-[#101010] p-5 xl:sticky xl:top-6">
              {selectedOrder ? (
                <div className="space-y-5">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">
                      Detalle
                    </p>
                    <h2 className="mt-2 text-2xl font-black text-white">
                      #{selectedOrder.id.slice(0, 6).toUpperCase()}
                    </h2>
                    <p className="mt-2 text-sm text-neutral-400">
                      Estado actual del pedido y resumen operativo.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
                      Cliente
                    </p>
                    <p className="mt-3 text-base font-semibold text-white">
                      {selectedOrder.customer?.name || "Sin nombre"}
                    </p>
                    <p className="mt-1 text-sm text-neutral-400">
                      {selectedOrder.customer?.phone || "Sin teléfono"}
                    </p>
                    <p className="mt-3 text-sm text-neutral-400">
                      {selectedOrder.customer?.address || "Sin dirección"}
                    </p>
                    {selectedOrder.customer?.notes ? (
                      <p className="mt-3 text-sm text-neutral-500">
                        Nota: {selectedOrder.customer.notes}
                      </p>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
                      Operación
                    </p>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Canal</span>
                        <span className="text-white">{formatChannel(selectedOrder.channel)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Entrega</span>
                        <span className="text-white">
                          {formatFulfillment(selectedOrder.fulfillmentType)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Estado</span>
                        <span
                          className={`rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${statusStyles(
                            selectedOrder.status ?? ""
                          )}`}
                        >
                          {statusLabel(selectedOrder.status ?? "")}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Pago</span>
                        <span className="text-white">
                          {formatPaymentMethod(selectedOrder.paymentMethod)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Fecha</span>
                        <span className="text-white">
                          {formatReadableDate(selectedOrderCreatedAt)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Hora</span>
                        <span className="text-white">
                          {formatReadableTime(selectedOrderCreatedAt)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Antigüedad</span>
                        <span className="text-white">
                          {formatElapsedTime(selectedOrderCreatedAt, nowTs)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
                      Items
                    </p>
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

                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
                      Totales
                    </p>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Subtotal</span>
                        <span className="text-white">
                          {formatMoney(selectedOrder.totals?.subtotal)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Delivery</span>
                        <span className="text-white">
                          {formatMoney(selectedOrder.totals?.delivery)}
                        </span>
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
          </div>
        )}
      </div>
    </main>
  );
}
