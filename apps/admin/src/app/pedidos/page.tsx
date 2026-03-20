"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { useLiveOrders } from "../../hooks/use-live-orders";
import {
  updateOrderStatus,
  type AdminOrder,
  type OrderStatus,
} from "../../lib/firebase/queries/orders";
import { db } from "../../lib/firebase/client";

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

function formatFulfillment(type?: string) {
  if (type === "delivery") return "Delivery";
  if (type === "pickup") return "Retiro";
  return "Sin definir";
}

function formatMoney(value?: number) {
  return `$${(value ?? 0).toLocaleString("es-CL")}`;
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
}: {
  order: AdminOrder;
  selected: boolean;
  onSelect: () => void;
  onChangeStatus: (orderId: string, nextStatus: OrderStatus) => Promise<void>;
  updatingId: string | null;
}) {
  const itemCount = getItemCount(order);

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
                  order.status
                )}`}
              >
                {order.status}
              </span>
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
                  {status}
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

  const selectedOrder = useMemo(() => {
    if (!orders.length) return null;
    const found = orders.find((order) => order.id === selectedOrderId);
    return found ?? orders[0];
  }, [orders, selectedOrderId]);

  const handleChangeStatus = async (
    orderId: string,
    nextStatus: OrderStatus
  ) => {
    try {
      setUpdatingId(orderId);
      await updateOrderStatus(tenantId, orderId, nextStatus);
    } catch (error) {
      console.error("Error actualizando estado:", error);
    } finally {
      setUpdatingId(null);
    }
  };

  const resolveProductName = (productId?: string) => {
    if (!productId) return "Producto";
    return productNames[productId] || prettifyProductId(productId);
  };

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

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.15em] text-neutral-500">
                Total visible
              </p>
              <p className="mt-1 text-2xl font-bold text-white">{orders.length}</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.15em] text-neutral-500">
                En cola
              </p>
              <p className="mt-1 text-2xl font-bold text-yellow-300">
                {orders.filter((o) => o.status === "queued").length}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.15em] text-neutral-500">
                En reparto
              </p>
              <p className="mt-1 text-2xl font-bold text-violet-300">
                {orders.filter((o) => o.status === "on_the_way").length}
              </p>
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
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_380px]">
            <section className="grid gap-4">
              {orders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  selected={selectedOrder?.id === order.id}
                  onSelect={() => setSelectedOrderId(order.id)}
                  onChangeStatus={handleChangeStatus}
                  updatingId={updatingId}
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
                        <span className="text-white">{selectedOrder.channel || "own"}</span>
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
                            selectedOrder.status
                          )}`}
                        >
                          {selectedOrder.status}
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
        )}
      </div>
    </main>
  );
}