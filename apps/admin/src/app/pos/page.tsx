"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { db } from "../../lib/firebase/client";
import { createPosSaleApi, ApiRequestError } from "../../lib/api/orders";
import {
  Minus,
  Plus,
  Search,
  ShoppingCart,
  User,
  Phone,
  Mail,
  MapPin,
  Store,
  Bike,
  Trash2,
  MessageSquare,
} from "lucide-react";

type PosProduct = {
  id: string;
  name: string;
  price: number;
  categoryId?: string;
  imageUrl?: string;
  description?: string;
  isActive?: boolean;
};

type PosCartItem = {
  product: PosProduct;
  quantity: number;
};

type PosOrder = {
  id: string;
  total?: number;
  paymentMethod?: "pending" | "cash" | "card" | "transfer";
  createdAt?: unknown;
  totals?: {
    total?: number;
  };
};

const tenantId = "tbb";

function formatMoney(value?: number) {
  return `$${(value ?? 0).toLocaleString("es-CL")}`;
}

function getFallbackImage(product: PosProduct) {
  const id = product.categoryId ?? "";
  if (id.includes("bebidas")) return "/images/stubs/drink.png";
  if (id.includes("papas")) return "/images/stubs/fries.png";
  if (id.includes("mechada")) return "/images/stubs/mechada-real.jpg";
  return "/images/stubs/burger-real.jpg";
}

export default function PosPage() {
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [fulfillmentType, setFulfillmentType] = useState<"delivery" | "pickup">(
    "pickup"
  );

  const [toast, setToast] = useState<{
  type: "success" | "error";
  message: string;
} | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<
  "cash" | "transfer" | "card" | "pending"
  >("pending");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [todayOrders, setTodayOrders] = useState<PosOrder[]>([]);
  const startOfDay = useMemo(() => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Timestamp.fromDate(now);
}, []);
useEffect(() => {
  if (!toast) return;

 const timer = setTimeout(() => {
  setToast(null);
}, 4000);

  return () => clearTimeout(timer);
}, [toast]);
  useEffect(() => {
    const ref = collection(db, `tenants/${tenantId}/products`);
    const q = query(ref, where("isActive", "==", true));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const nextProducts: PosProduct[] = snapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...(doc.data() as Omit<PosProduct, "id">),
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        setProducts(nextProducts);
        setLoadingProducts(false);
      },
      (error) => {
        console.error("Error cargando productos POS:", error);
        setLoadingProducts(false);
      }
    );

    return () => unsub();
  }, []);

  useEffect(() => {
  const ref = collection(db, `tenants/${tenantId}/orders`);
  const q = query(
    ref,
    where("createdAt", ">=", startOfDay),
    orderBy("createdAt", "desc")
  );

  const unsub = onSnapshot(
    q,
    (snapshot) => {
      const nextOrders: PosOrder[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<PosOrder, "id">),
      }));

      setTodayOrders(nextOrders);
    },
    (error) => {
      console.error("Error cargando órdenes del día:", error);
    }
  );

  return () => unsub();
}, [startOfDay]);

  const categories = useMemo(() => {
    const unique = new Map<string, string>();

    products.forEach((product) => {
      const raw = product.categoryId || "sin-categoria";
      const label =
        raw === "sin-categoria"
          ? "Sin categoría"
          : raw
              .replace(/-/g, " ")
              .replace(/\b\w/g, (l) => l.toUpperCase());

      unique.set(raw, label);
    });

    return [{ id: "all", label: "Todo" }, ...Array.from(unique.entries()).map(([id, label]) => ({ id, label }))];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchCategory =
        activeCategory === "all" || product.categoryId === activeCategory;

      const matchSearch =
        q.length === 0 ||
        product.name?.toLowerCase().includes(q) ||
        product.description?.toLowerCase().includes(q);

      return matchCategory && matchSearch;
    });
  }, [products, search, activeCategory]);

  const subtotal = useMemo(() => {
    return cart.reduce(
      (acc, item) => acc + (item.product.price ?? 0) * item.quantity,
      0
    );
  }, [cart]);

  const delivery = fulfillmentType === "delivery" ? 1500 : 0;
  const total = subtotal + delivery;

  const itemCount = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.quantity, 0);
  }, [cart]);

  const isFormValid =
    cart.length > 0 &&
    customerName.trim().length >= 2 &&
    customerPhone.trim().length >= 8 &&
    (fulfillmentType === "pickup" || address.trim().length >= 6);

  function addToCart(product: PosProduct) {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);

      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [...prev, { product, quantity: 1 }];
    });
  }

  const totalSalesToday = useMemo(() => {
  return todayOrders.reduce((acc, order) => {
    const value = order.totals?.total ?? order.total ?? 0;
    return acc + value;
  }, 0);
}, [todayOrders]);

const ordersTodayCount = todayOrders.length;

const averageTicketToday = useMemo(() => {
  if (ordersTodayCount === 0) return 0;
  return totalSalesToday / ordersTodayCount;
}, [totalSalesToday, ordersTodayCount]);

  function updateQuantity(productId: string, nextQty: number) {
    if (nextQty <= 0) {
      setCart((prev) => prev.filter((item) => item.product.id !== productId));
      return;
    }

    setCart((prev) =>
      prev.map((item) =>
        item.product.id === productId
          ? { ...item, quantity: nextQty }
          : item
      )
    );
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  }

  function clearPos() {
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerEmail("");
    setAddress("");
    setNotes("");
    setFulfillmentType("pickup");
    setPaymentMethod("pending");
  }

  async function handleCreateOrder() {
    if (!isFormValid) return;

    try {
      setIsSubmitting(true);

      const orderItems = cart.map((item) => ({
        productId: item.product.id,
        qty: item.quantity,
      }));

      const { orderId } = await createPosSaleApi({
        tenantId,
        items: orderItems,
        customer: {
          name: customerName.trim(),
          phone: customerPhone.trim(),
          email: customerEmail.trim() || undefined,
          address: fulfillmentType === "delivery" ? address.trim() : "",
          notes: notes.trim(),
        },
        fulfillmentType,
        paymentMethod,
      });

      clearPos();
      setToast({
        type: "success",
        message: `Pedido creado #${orderId.slice(0, 6).toUpperCase()}`,
      });
    } catch (error) {
      console.error("Error creando pedido POS:", error);
      let errorMsg = "No pudimos crear el pedido desde POS.";
      if (error instanceof ApiRequestError) {
        errorMsg = `[${error.code}] ${error.message}`;
      } else if (error instanceof Error) {
        errorMsg = error.message;
      }
      setToast({
        type: "error",
        message: errorMsg,
      });
    } finally {
      setIsSubmitting(false);
    }
  }
return (
  <main className="min-h-screen bg-[#0B0B0B] text-white">
    <div className="mx-auto max-w-[1600px] px-6 py-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.25em] text-emerald-400/80">
            Centro de venta
          </p>
          <h1 className="text-4xl font-black tracking-tight text-white">
            POS Lite
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Venta manual para caja, WhatsApp, mostrador y eventos.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <p className="text-xs uppercase tracking-[0.15em] text-neutral-500">
            Estado
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-300">
            Operativo
          </p>
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">
            Ventas hoy
          </p>
          <p className="mt-3 text-3xl font-black text-emerald-400">
            {formatMoney(totalSalesToday)}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">
            Pedidos hoy
          </p>
          <p className="mt-3 text-3xl font-black text-white">
            {ordersTodayCount}
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">
            Ticket promedio
          </p>
          <p className="mt-3 text-3xl font-black text-cyan-300">
            {formatMoney(averageTicketToday)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_420px]">
        <section className="min-w-0 rounded-3xl border border-white/10 bg-[#101010] p-6">
          <div className="mb-5 flex flex-col gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                Catálogo rápido
              </p>
              <h2 className="mt-3 text-2xl font-bold text-white">
                Venta manual
              </h2>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar producto..."
                className="w-full rounded-2xl border border-white/10 bg-white/[0.03] py-3 pl-11 pr-4 text-white outline-none transition-colors placeholder:text-neutral-500 focus:border-emerald-400/30"
              />
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {categories.map((category) => {
                const active = activeCategory === category.id;

                return (
                  <button
                    key={category.id}
                    onClick={() => setActiveCategory(category.id)}
                    className={[
                      "shrink-0 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition-all",
                      active
                        ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300 shadow-[0_0_0_1px_rgba(0,255,156,0.04),0_0_16px_rgba(0,255,156,0.06)]"
                        : "border-white/10 bg-white/[0.03] text-neutral-400 hover:border-white/20 hover:text-white",
                    ].join(" ")}
                  >
                    {category.label}
                  </button>
                );
              })}
            </div>
          </div>

          {loadingProducts ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center text-neutral-500">
              Cargando productos...
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center text-neutral-500">
              No encontramos productos con ese filtro.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  className="overflow-hidden rounded-3xl border border-white/10 bg-[#0D0D0D]"
                >
                  <div className="aspect-[4/3] overflow-hidden border-b border-white/6 bg-black/20">
                    <img
                      src={product.imageUrl || getFallbackImage(product)}
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  </div>

                  <div className="p-4">
                    <p className="line-clamp-1 text-lg font-bold text-white">
                      {product.name}
                    </p>
                    <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm text-neutral-500">
                      {product.description || "Producto disponible para venta manual."}
                    </p>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <span className="text-xl font-black text-emerald-400">
                        {formatMoney(product.price)}
                      </span>

                      <button
                        onClick={() => addToCart(product)}
                        className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-300 transition-all hover:border-emerald-400/30 hover:bg-emerald-400/15"
                      >
                        Agregar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="rounded-3xl border border-white/10 bg-[#101010] p-5">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-neutral-500">
                Resumen
              </p>
              <h3 className="mt-2 text-2xl font-black text-white">
                Caja operativa
              </h3>
              <p className="mt-2 text-sm text-neutral-400">
                Carrito POS, cobro rápido y resumen del turno.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <ShoppingCart className="h-5 w-5 text-emerald-300" />
            </div>
          </div>

          <div className="space-y-3">
            {cart.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center text-neutral-500">
                Aún no agregas productos al POS.
              </div>
            ) : (
              cart.map((item) => (
                <div
                  key={item.product.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"
                >
                  <div className="flex items-start gap-3">
                    <img
                      src={item.product.imageUrl || getFallbackImage(item.product)}
                      alt={item.product.name}
                      className="h-16 w-16 rounded-xl object-cover"
                    />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">
                        {item.product.name}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {formatMoney(item.product.price)} c/u
                      </p>

                      <div className="mt-3 flex items-center gap-2">
                        <button
                          onClick={() =>
                            updateQuantity(item.product.id, item.quantity - 1)
                          }
                          className="rounded-xl border border-white/10 bg-white/[0.03] p-2 text-neutral-300 hover:text-white"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>

                        <span className="min-w-[28px] text-center text-sm font-bold text-white">
                          {item.quantity}
                        </span>

                        <button
                          onClick={() =>
                            updateQuantity(item.product.id, item.quantity + 1)
                          }
                          className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-2 text-emerald-300"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="text-right">
                      <button
                        onClick={() => removeFromCart(item.product.id)}
                        className="mb-2 text-neutral-500 transition-colors hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <p className="text-sm font-bold text-emerald-400">
                        {formatMoney(item.product.price * item.quantity)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-5 space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="relative">
              <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nombre completo"
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-3 pl-11 pr-4 text-white outline-none placeholder:text-neutral-500 focus:border-emerald-400/30"
              />
            </div>

            <div className="relative">
              <Phone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
              <input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="WhatsApp (+569...)"
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-3 pl-11 pr-4 text-white outline-none placeholder:text-neutral-500 focus:border-emerald-400/30"
              />
            </div>

            <div className="relative">
              <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="Email (opcional)"
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-3 pl-11 pr-4 text-white outline-none placeholder:text-neutral-500 focus:border-emerald-400/30"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setFulfillmentType("delivery")}
                className={[
                  "flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-all",
                  fulfillmentType === "delivery"
                    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
                    : "border-white/10 bg-white/[0.03] text-neutral-300",
                ].join(" ")}
              >
                <Bike className="h-4 w-4" />
                Delivery
              </button>

              <button
                onClick={() => setFulfillmentType("pickup")}
                className={[
                  "flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-all",
                  fulfillmentType === "pickup"
                    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
                    : "border-white/10 bg-white/[0.03] text-neutral-300",
                ].join(" ")}
              >
                <Store className="h-4 w-4" />
                Retiro
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">
                Método de pago
              </p>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "cash", label: "Efectivo" },
                  { id: "transfer", label: "Transferencia" },
                  { id: "card", label: "Tarjeta" },
                  { id: "pending", label: "Pendiente" },
                ].map((option) => {
                  const active = paymentMethod === option.id;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() =>
                        setPaymentMethod(
                          option.id as "cash" | "transfer" | "card" | "pending"
                        )
                      }
                      className={[
                        "rounded-xl border px-4 py-3 text-sm font-semibold transition-all",
                        active
                          ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
                          : "border-white/10 bg-white/[0.03] text-neutral-300",
                      ].join(" ")}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {fulfillmentType === "delivery" ? (
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Dirección de entrega"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-3 pl-11 pr-4 text-white outline-none placeholder:text-neutral-500 focus:border-emerald-400/30"
                />
              </div>
            ) : null}

            <div className="relative">
              <MessageSquare className="pointer-events-none absolute left-4 top-4 h-4 w-4 text-neutral-500" />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas del pedido"
                rows={3}
                className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] py-3 pl-11 pr-4 text-white outline-none placeholder:text-neutral-500 focus:border-emerald-400/30"
              />
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center justify-between text-sm text-neutral-400">
              <span>Productos</span>
              <span>{itemCount}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm text-neutral-400">
              <span>Subtotal</span>
              <span>{formatMoney(subtotal)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm text-neutral-400">
              <span>{fulfillmentType === "delivery" ? "Delivery" : "Retiro"}</span>
              <span>{formatMoney(delivery)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm text-neutral-400">
              <span>Pago</span>
              <span>
                {{
                  cash: "Efectivo",
                  transfer: "Transferencia",
                  card: "Tarjeta",
                  pending: "Pendiente",
                }[paymentMethod]}
              </span>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
              <span className="text-lg font-semibold text-white">Total</span>
              <span className="text-3xl font-black text-emerald-400">
                {formatMoney(total)}
              </span>
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            <button
              onClick={() => void handleCreateOrder()}
              disabled={!isFormValid || isSubmitting}
              className={[
                "rounded-2xl py-4 text-sm font-black uppercase tracking-[0.12em] transition-all",
                !isFormValid || isSubmitting
                  ? "cursor-not-allowed bg-white/8 text-neutral-500"
                  : "bg-emerald-400 text-black shadow-[0_0_18px_rgba(0,255,156,0.22)] hover:bg-emerald-300",
              ].join(" ")}
            >
              {isSubmitting ? "Creando pedido..." : "Confirmar venta"}
            </button>

            <button
              onClick={clearPos}
              className="rounded-2xl border border-white/10 bg-white/[0.03] py-3 text-sm font-semibold text-neutral-300 transition-all hover:border-white/20 hover:text-white"
            >
              Limpiar POS
            </button>

            {toast ? (
  <div className="pointer-events-none fixed top-6 right-6 z-[100]">
    <div
      className={[
        "min-w-[260px] rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-sm",
        toast.type === "success"
          ? "border-emerald-400/20 bg-[#07150f]/95 text-emerald-200"
          : "border-red-400/20 bg-[#1a0b0b]/95 text-red-200",
      ].join(" ")}
    >
      <p className="text-sm font-semibold">
        {toast.type === "success" ? "Venta registrada" : "Error operativo"}
      </p>
      <p className="mt-1 text-sm opacity-90">{toast.message}</p>
    </div>
  </div>
) : null}
          </div>
        </aside>
      </div>
    </div>
  </main>
);
}
