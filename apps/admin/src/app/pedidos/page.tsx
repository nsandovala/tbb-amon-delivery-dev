"use client";

import { useState } from "react";
import { useLiveOrders } from "../../hooks/use-live-orders";
import {
  updateOrderStatus,
  type AdminOrder,
  type OrderStatus,
} from "../../lib/firebase/queries/orders";

const tenantId = "tbb";

const STATUS_OPTIONS: OrderStatus[] = [
  "queued",
  "preparing",
  "ready",
  "on_the_way",
  "delivered",
  "cancelled",
];

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

function OrderCard({
  order,
  onChangeStatus,
  updatingId,
}: {
  order: AdminOrder;
  onChangeStatus: (orderId: string, nextStatus: OrderStatus) => Promise<void>;
  updatingId: string | null;
}) {
  const itemCount =
    order.items?.reduce((acc, item) => acc + (item.qty || 0), 0) ?? 0;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#101010] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
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
                <p className="text-xs text-neutral-500">
                  {order.customer.address}
                </p>
              ) : null}
              {order.customer?.notes ? (
                <p className="text-xs text-neutral-500">
                  Nota: {order.customer.notes}
                </p>
              ) : null}
            </div>
          </div>

          <div className="text-right">
            <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
              {formatFulfillment(order.fulfillmentType)}
            </p>
            <p className="mt-1 text-2xl font-bold text-emerald-400">
              ${order.totals?.total?.toLocaleString("es-CL") ?? "0"}
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
                <button
                  key={status}
                  onClick={() => onChangeStatus(order.id, status)}
                  disabled={disabled || active}
                  className={[
                    "rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition-all",
                    active
                      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                      : "border-white/10 bg-white/[0.03] text-neutral-300 hover:border-white/20 hover:bg-white/[0.05] hover:text-white",
                    disabled ? "cursor-not-allowed opacity-60" : "",
                  ].join(" ")}
                >
                  {status}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const { orders, loading } = useLiveOrders(tenantId);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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

  return (
    <main className="min-h-screen bg-[#0B0B0B] text-white">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.25em] text-emerald-400/80">
              AMON Admin
            </p>
            <h1 className="text-4xl font-black tracking-tight text-white">
              Pedidos en vivo
            </h1>
            <p className="mt-2 text-sm text-neutral-400">
              Cola operativa del tenant TBB en tiempo real.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-right">
            <p className="text-xs uppercase tracking-[0.15em] text-neutral-500">
              Total visible
            </p>
            <p className="text-2xl font-bold text-white">{orders.length}</p>
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
          <div className="grid gap-4">
            {orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onChangeStatus={handleChangeStatus}
                updatingId={updatingId}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
