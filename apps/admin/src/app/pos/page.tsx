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
import { normalizeChileanPhone, isValidChileanPhone } from "../../lib/phone";
import { db } from "../../lib/firebase/client";
import { createPosSaleApi, updateOrderStatusApi } from "../../lib/api/orders";
import { getHumanOrderLabel } from "../../lib/orders";
import { getOperationalDayStart } from "../../lib/time";
import {
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Loader2,
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
  displayCode?: string;
  displayOrderNumber?: number;
  operationalDate?: string;
  status?: string;
  channel?: string;
  total?: number;
  paymentMethod?: "pending" | "cash" | "card" | "transfer";
  fulfillmentType?: "delivery" | "pickup";
  customer?: {
    name?: string;
    phone?: string;
  };
  createdAt?: unknown;
  totals?: {
    total?: number;
  };
};

const tenantId = "tbb";
const COUNTER_CUSTOMER_NAME = "Cliente mostrador";

/**
 * A sale stays operationally open until it is handed over. Only a closed (delivered)
 * sale is financially final — order.completed fires on delivered — so an unclosed sale
 * is revenue the books will never see.
 */
const ACTIVE_POS_STATUSES = new Set(["queued", "preparing", "ready", "on_the_way"]);

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

  const [customerName, setCustomerName] = useState(COUNTER_CUSTOMER_NAME);
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [fulfillmentType, setFulfillmentType] = useState<"delivery" | "pickup">("pickup");
  const [showPickupCustomerFields, setShowPickupCustomerFields] = useState(false);

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
    detail?: string;
  } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer" | "card" | "pending">("pending");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [todayOrders, setTodayOrders] = useState<PosOrder[]>([]);
  const [pendingLiveOrder, setPendingLiveOrder] = useState<{
    orderId: string;
    displayCode: string;
  } | null>(null);
  const [verifiedLiveOrder, setVerifiedLiveOrder] = useState<{
    orderId: string;
    displayCode: string;
  } | null>(null);
  const [closingIds, setClosingIds] = useState<Set<string>>(new Set());

  const startOfDay = useMemo(() => {
    return Timestamp.fromDate(getOperationalDayStart(new Date()));
  }, []);

  const normalizedPhone = customerPhone.trim()
    ? normalizeChileanPhone(customerPhone)
    : null;
  const isPickupCounterSale =
    fulfillmentType === "pickup" &&
    !showPickupCustomerFields &&
    customerName.trim() === COUNTER_CUSTOMER_NAME;
  const phoneRequired = fulfillmentType === "delivery";
  const phoneOk = phoneRequired
    ? isValidChileanPhone(customerPhone)
    : customerPhone.trim().length === 0 || isValidChileanPhone(customerPhone);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (fulfillmentType === "delivery") {
      setShowPickupCustomerFields(true);
      if (customerName.trim() === COUNTER_CUSTOMER_NAME && !customerPhone.trim()) {
        setCustomerName("");
      }
      return;
    }

    if (!customerName.trim()) {
      setCustomerName(COUNTER_CUSTOMER_NAME);
    }
  }, [customerName, customerPhone, fulfillmentType]);

  useEffect(() => {
    const ref = collection(db, `tenants/${tenantId}/products`);
    const q = query(ref, where("isActive", "==", true));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const nextProducts: PosProduct[] = snapshot.docs
          .map((doc) => ({ id: doc.id, ...(doc.data() as Omit<PosProduct, "id">) }))
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
    const q = query(ref, where("createdAt", ">=", startOfDay), orderBy("createdAt", "desc"));

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

  useEffect(() => {
    if (!pendingLiveOrder) return;
    const persistedOrder = todayOrders.find((order) => order.id === pendingLiveOrder.orderId);
    if (!persistedOrder) return;
    setVerifiedLiveOrder({
      orderId: persistedOrder.id,
      displayCode: persistedOrder.displayCode || pendingLiveOrder.displayCode,
    });
    setPendingLiveOrder(null);
    setToast({
      type: "success",
      message: `${getHumanOrderLabel({
        id: persistedOrder.id,
        displayCode: persistedOrder.displayCode || pendingLiveOrder.displayCode,
      })} visible en /pedidos`,
      detail: "La venta ya quedó persistida en Firestore y reflejada en el stream operativo.",
    });
  }, [pendingLiveOrder, todayOrders]);

  const categories = useMemo(() => {
    const unique = new Map<string, string>();
    products.forEach((product) => {
      const raw = product.categoryId || "sin-categoria";
      const label =
        raw === "sin-categoria"
          ? "Sin categoría"
          : raw.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
      unique.set(raw, label);
    });
    return [{ id: "all", label: "Todo" }, ...Array.from(unique.entries()).map(([id, label]) => ({ id, label }))];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchCategory = activeCategory === "all" || product.categoryId === activeCategory;
      const matchSearch =
        q.length === 0 ||
        product.name?.toLowerCase().includes(q) ||
        product.description?.toLowerCase().includes(q);
      return matchCategory && matchSearch;
    });
  }, [products, search, activeCategory]);

  const subtotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + (item.product.price ?? 0) * item.quantity, 0);
  }, [cart]);

  const delivery = fulfillmentType === "delivery" ? 1500 : 0;
  const total = subtotal + delivery;

  const itemCount = useMemo(() => cart.reduce((acc, item) => acc + item.quantity, 0), [cart]);

  const isFormValid =
    cart.length > 0 &&
    customerName.trim().length >= 2 &&
    phoneOk &&
    (fulfillmentType === "pickup" || address.trim().length >= 6);

  const successfulTodayOrders = useMemo(
    () => todayOrders.filter((o) => o.status !== "cancelled"),
    [todayOrders]
  );

  // Only presential POS sales. Web orders stay in the kitchen flow of /pedidos:
  // closing them from here would mark food as delivered before it left the truck.
  const openSales = useMemo(
    () =>
      todayOrders.filter(
        (o) => o.channel === "admin_pos" && ACTIVE_POS_STATUSES.has(o.status ?? "")
      ),
    [todayOrders]
  );

  const totalSalesToday = useMemo(() => {
    return successfulTodayOrders.reduce((acc, order) => {
      const value = order.totals?.total ?? order.total ?? 0;
      return acc + value;
    }, 0);
  }, [successfulTodayOrders]);

  const ordersTodayCount = successfulTodayOrders.length;

  const averageTicketToday = useMemo(() => {
    if (ordersTodayCount === 0) return 0;
    return totalSalesToday / ordersTodayCount;
  }, [totalSalesToday, ordersTodayCount]);

  function addToCart(product: PosProduct) {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }

  function updateQuantity(productId: string, nextQty: number) {
    if (nextQty <= 0) {
      setCart((prev) => prev.filter((item) => item.product.id !== productId));
      return;
    }
    setCart((prev) =>
      prev.map((item) => item.product.id === productId ? { ...item, quantity: nextQty } : item)
    );
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  }

  function clearPos() {
    setCart([]);
    setCustomerName(COUNTER_CUSTOMER_NAME);
    setCustomerPhone("");
    setCustomerEmail("");
    setAddress("");
    setNotes("");
    setFulfillmentType("pickup");
    setPaymentMethod("pending");
    setShowPickupCustomerFields(false);
    setVerifiedLiveOrder(null);
  }

  async function handleCreateOrder() {
    if (!isFormValid || isSubmitting) return;

    if (phoneRequired && (!phoneOk || !normalizedPhone)) {
      setToast({ type: "error", message: "Ingresa un WhatsApp chileno válido. Ej: +56912345678" });
      return;
    }

    try {
      setIsSubmitting(true);
      setPendingLiveOrder(null);
      setVerifiedLiveOrder(null);

      const orderItems = cart.map((item) => ({ productId: item.product.id, qty: item.quantity }));

      const { orderId, displayCode } = await createPosSaleApi({
        tenantId,
        items: orderItems,
        customer: {
          name: customerName.trim(),
          ...(normalizedPhone ? { phone: normalizedPhone } : {}),
          email: customerEmail.trim() || undefined,
          address: fulfillmentType === "delivery" ? address.trim() : "",
          notes: notes.trim(),
        },
        fulfillmentType,
        paymentMethod,
      });

      setPendingLiveOrder({ orderId, displayCode });
      clearPos();
      setToast({
        type: "success",
        message: `${getHumanOrderLabel({ id: orderId, displayCode })} creada`,
        detail: "Esperando confirmación live en /pedidos...",
      });
    } catch (error) {
      console.error("Error creando pedido POS:", error);
      setToast({
        type: "error",
        message: "No pudimos crear el pedido desde POS.",
        detail: error instanceof Error ? error.message : "Revisa Functions y Firestore.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCloseSale(orderId: string) {
    if (closingIds.has(orderId)) return;

    const targetOrder = todayOrders.find((order) => order.id === orderId);
    const humanLabel = targetOrder
      ? getHumanOrderLabel(targetOrder)
      : "Venta POS";

    setClosingIds((prev) => new Set(prev).add(orderId));

    try {
      await updateOrderStatusApi(orderId, "delivered");
      setToast({
        type: "success",
        message: `${humanLabel} cerrada`,
        detail: "Queda como entregada y financieramente cerrada.",
      });
    } catch (error) {
      console.error("Error cerrando venta POS:", error);
      setToast({
        type: "error",
        message: "No pudimos cerrar la venta.",
        detail: error instanceof Error ? error.message : "Revisa Functions y Firestore.",
      });
    } finally {
      setClosingIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  }

  const paymentLabels: Record<string, string> = {
    cash: "Efectivo",
    transfer: "Transferencia",
    card: "Tarjeta",
    pending: "Pendiente",
  };

  return (
    <main className="min-h-screen bg-[#0B0B0B] text-white">
      <div className={["mx-auto max-w-[1600px] px-4 py-5", cart.length > 0 ? "pb-24 xl:pb-5" : ""].join(" ")}>

        {/* Header compacto */}
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-emerald-400/80">Centro de venta</p>
            <h1 className="mt-0.5 text-2xl font-black tracking-tight text-white">POS Lite</h1>
            <p className="mt-1 text-xs text-neutral-400">
              Venta manual · {itemCount > 0 ? `${itemCount} ${itemCount === 1 ? "item" : "items"} en caja` : "caja vacía"}
            </p>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="shrink-0 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.14em] text-neutral-500">Ventas</p>
              <p className="mt-0.5 text-base font-black text-emerald-400 xl:text-xl">{formatMoney(totalSalesToday)}</p>
            </div>
            <div className="shrink-0 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.14em] text-neutral-500">Pedidos</p>
              <p className="mt-0.5 text-base font-black text-white xl:text-xl">{ordersTodayCount}</p>
            </div>
            <div className="shrink-0 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.14em] text-neutral-500">Ticket</p>
              <p className="mt-0.5 text-base font-black text-cyan-300 xl:text-xl">{formatMoney(averageTicketToday)}</p>
            </div>
          </div>
        </div>

        {/* Layout principal */}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_400px]">

          {/* CATÁLOGO COMPACTO */}
          <section className="rounded-2xl border border-white/10 bg-[#101010] p-4">

            {/* Búsqueda + categorías */}
            <div className="mb-3 space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar producto..."
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-500 focus:border-emerald-400/30"
                />
              </div>

              <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {categories.map((category) => {
                  const active = activeCategory === category.id;
                  return (
                    <button
                      key={category.id}
                      onClick={() => setActiveCategory(category.id)}
                      className={[
                        "shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition-all",
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

            {/* Grid de productos */}
            {loadingProducts ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] px-6 py-8 text-center text-sm text-neutral-500">
                Cargando productos...
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-8 text-center text-sm text-neutral-500">
                Sin productos para este filtro.
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                {filteredProducts.map((product) => {
                  const cartItem = cart.find((i) => i.product.id === product.id);
                  return (
                    <div
                      key={product.id}
                      className="flex items-center gap-3 rounded-xl border border-white/8 bg-[#0D0D0D] p-2.5 transition-colors hover:border-white/16"
                    >
                      <img
                        src={product.imageUrl || getFallbackImage(product)}
                        alt={product.name}
                        className="h-12 w-12 shrink-0 rounded-lg object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold leading-tight text-white">
                          {product.name}
                        </p>
                        {product.description ? (
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-neutral-500">
                            {product.description}
                          </p>
                        ) : null}
                        <p className="mt-0.5 text-sm font-bold text-emerald-400">
                          {formatMoney(product.price)}
                        </p>
                      </div>
                      <button
                        onClick={() => addToCart(product)}
                        className={[
                          "shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-all",
                          cartItem
                            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                            : "border-white/10 bg-white/[0.04] text-neutral-300 hover:border-emerald-400/20 hover:bg-emerald-400/[0.04] hover:text-white",
                        ].join(" ")}
                      >
                        {cartItem ? `×${cartItem.quantity}` : "+"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* VENTAS ABIERTAS — sin cerrar no hay evento financiero */}
            {openSales.length > 0 ? (
              <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-amber-300/90">
                    Ventas sin cerrar
                  </p>
                  <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[11px] font-bold text-amber-200">
                    {openSales.length}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {openSales.map((sale) => {
                    const isClosing = closingIds.has(sale.id);
                    const saleTotal = sale.totals?.total ?? sale.total ?? 0;

                    return (
                      <div
                        key={sale.id}
                        className="flex items-center gap-2.5 rounded-lg border border-white/8 bg-[#0D0D0D] p-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white">
                            {getHumanOrderLabel({ id: sale.id, displayCode: sale.displayCode })}
                            <span className="ml-2 text-[11px] font-normal text-neutral-500">
                              {paymentLabels[sale.paymentMethod ?? "pending"]}
                              {" · "}
                              {sale.fulfillmentType === "delivery" ? "Delivery" : "Retiro"}
                            </span>
                          </p>
                          {sale.customer?.name ? (
                            <p className="text-[11px] text-neutral-500">{sale.customer.name}</p>
                          ) : null}
                          <p className="text-sm font-bold text-emerald-400">
                            {formatMoney(saleTotal)}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => void handleCloseSale(sale.id)}
                          disabled={isClosing}
                          className={[
                            "shrink-0 rounded-lg px-3 py-2 text-[11px] font-black uppercase tracking-[0.1em] transition-all",
                            isClosing
                              ? "cursor-not-allowed bg-white/[0.06] text-neutral-500"
                              : "bg-emerald-400 text-black hover:bg-emerald-300",
                          ].join(" ")}
                        >
                          {isClosing ? "Cerrando..." : "Cerrar venta"}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <p className="mt-2 text-[11px] text-neutral-500">
                  Una venta sin cerrar no queda entregada ni cuenta como venta final.
                </p>
              </div>
            ) : null}
          </section>

          {/* CAJA OPERATIVA */}
          <aside id="pos-checkout" className="rounded-2xl border border-white/10 bg-[#101010] p-4">

            {/* Header caja */}
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">Resumen</p>
                <h3 className="mt-0.5 text-lg font-black text-white">Caja operativa</h3>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
                <ShoppingCart className="h-4 w-4 text-emerald-300" />
              </div>
            </div>

            {/* Items del carrito */}
            {cart.length === 0 ? (
              <div className="mb-4 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-center text-sm text-neutral-500">
                Agrega productos para iniciar una venta.
              </div>
            ) : (
              <div className="mb-4 space-y-1.5">
                {cart.map((item) => (
                  <div
                    key={item.product.id}
                    className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-2.5"
                  >
                    <img
                      src={item.product.imageUrl || getFallbackImage(item.product)}
                      alt={item.product.name}
                      className="h-10 w-10 shrink-0 rounded-lg object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{item.product.name}</p>
                      <p className="text-xs text-neutral-500">{formatMoney(item.product.price)} c/u</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                        className="rounded-lg border border-white/10 bg-white/[0.03] p-1.5 text-neutral-300 hover:text-white"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="min-w-[22px] text-center text-sm font-bold text-white">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                        className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-1.5 text-emerald-300"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => removeFromCart(item.product.id)}
                        className="ml-0.5 text-neutral-500 transition-colors hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="w-14 shrink-0 text-right text-sm font-bold text-emerald-400">
                      {formatMoney(item.product.price * item.quantity)}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Formulario */}
            <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
              {/* Fulfillment */}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => setFulfillmentType("delivery")}
                  className={[
                    "flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-all",
                    fulfillmentType === "delivery"
                      ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
                      : "border-white/10 bg-white/[0.03] text-neutral-300",
                  ].join(" ")}
                >
                  <Bike className="h-3.5 w-3.5" />
                  Delivery
                </button>
                <button
                  onClick={() => setFulfillmentType("pickup")}
                  className={[
                    "flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-all",
                    fulfillmentType === "pickup"
                      ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
                      : "border-white/10 bg-white/[0.03] text-neutral-300",
                  ].join(" ")}
                >
                  <Store className="h-3.5 w-3.5" />
                  Retiro
                </button>
              </div>

              {fulfillmentType === "pickup" ? (
                <div className="rounded-lg border border-emerald-400/15 bg-emerald-400/[0.05] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-emerald-300/80">
                        Venta rapida mostrador
                      </p>
                      <p className="mt-1 text-sm font-semibold text-white">
                        {isPickupCounterSale ? COUNTER_CUSTOMER_NAME : customerName || COUNTER_CUSTOMER_NAME}
                      </p>
                      <p className="mt-1 text-[11px] text-neutral-500">
                        Si no agregas telefono, no se crea customer y la venta queda igual operativa.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setCustomerName(COUNTER_CUSTOMER_NAME);
                        setCustomerPhone("");
                        setCustomerEmail("");
                        setShowPickupCustomerFields(false);
                      }}
                      className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-200 transition-all hover:bg-emerald-400/15"
                    >
                      Cliente mostrador
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowPickupCustomerFields((prev) => !prev)}
                    className="mt-3 text-[11px] font-semibold text-neutral-300 transition-colors hover:text-white"
                  >
                    {showPickupCustomerFields ? "Ocultar datos extra" : "Agregar datos del cliente"}
                  </button>
                </div>
              ) : null}

              {fulfillmentType === "delivery" || showPickupCustomerFields ? (
                <>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
                    <input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder={fulfillmentType === "delivery" ? "Nombre completo" : "Nombre del cliente"}
                      className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-emerald-400/30"
                    />
                  </div>

                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
                    <input
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder={fulfillmentType === "delivery" ? "WhatsApp (+569...)" : "WhatsApp (opcional)"}
                      className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-emerald-400/30"
                    />
                  </div>

                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
                    <input
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="Email (opcional)"
                      inputMode="email"
                      autoComplete="email"
                      className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-emerald-400/30"
                    />
                  </div>
                </>
              ) : null}

              {/* Método de pago */}
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    { id: "cash",     label: "Efectivo",      enabled: true },
                    { id: "transfer", label: "Transferencia", enabled: true },
                    { id: "card",     label: "Tarjeta",       enabled: false, disabledLabel: "Próximamente" },
                    { id: "pending",  label: "Pendiente",     enabled: true },
                  ] as { id: string; label: string; enabled: boolean; disabledLabel?: string }[]
                ).map((option) => {
                  const active = paymentMethod === option.id;
                  const disabled = !option.enabled;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => setPaymentMethod(option.id as "cash" | "transfer" | "card" | "pending")}
                      className={[
                        "rounded-lg border px-3 py-2 text-xs font-semibold transition-all",
                        disabled
                          ? "cursor-not-allowed border-white/5 bg-white/[0.02] text-neutral-600"
                          : active
                            ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
                            : "border-white/10 bg-white/[0.03] text-neutral-300",
                      ].join(" ")}
                    >
                      {disabled && option.disabledLabel ? (
                        <span className="flex flex-col items-center leading-none">
                          <span className="text-[10px] text-neutral-600">{option.label}</span>
                          <span className="text-[9px] italic text-neutral-600">{option.disabledLabel}</span>
                        </span>
                      ) : option.label}
                    </button>
                  );
                })}
              </div>

              {fulfillmentType === "delivery" ? (
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Dirección de entrega"
                    className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-emerald-400/30"
                  />
                </div>
              ) : null}

              <div className="relative">
                <MessageSquare className="pointer-events-none absolute left-3 top-3 h-3.5 w-3.5 text-neutral-500" />
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notas del pedido"
                  rows={2}
                  className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-emerald-400/30"
                />
              </div>
            </div>

            {/* Totales */}
            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between text-neutral-400">
                  <span>Subtotal</span>
                  <span>{formatMoney(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-neutral-400">
                  <span>{fulfillmentType === "delivery" ? "Delivery" : "Retiro"}</span>
                  <span>{formatMoney(delivery)}</span>
                </div>
                <div className="flex items-center justify-between text-neutral-400">
                  <span>Pago</span>
                  <span>{paymentLabels[paymentMethod]}</span>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-white/8 pt-3">
                <span className="text-sm font-semibold text-white">Total</span>
                <span
                  className={[
                    "text-2xl font-black",
                    cart.length > 0 ? "text-emerald-400" : "text-neutral-600",
                  ].join(" ")}
                >
                  {formatMoney(total)}
                </span>
              </div>
            </div>

            {/* Acciones */}
            <div className="mt-3 grid gap-2">
              <button
                onClick={() => void handleCreateOrder()}
                disabled={!isFormValid || isSubmitting}
                className={[
                  "flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-black uppercase tracking-[0.1em] transition-all",
                  !isFormValid || isSubmitting
                    ? "cursor-not-allowed bg-white/[0.06] text-neutral-500"
                    : "bg-emerald-400 text-black shadow-[0_0_18px_rgba(0,255,156,0.22)] hover:bg-emerald-300",
                ].join(" ")}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creando pedido...
                  </>
                ) : (
                  `Confirmar venta${cart.length > 0 ? ` · ${formatMoney(total)}` : ""}`
                )}
              </button>

              <button
                onClick={clearPos}
                disabled={isSubmitting}
                className="rounded-xl border border-white/10 bg-white/[0.03] py-2.5 text-xs font-semibold text-neutral-300 transition-all hover:border-white/20 hover:text-white"
              >
                Nueva venta
              </button>
            </div>

            {/* Estados live */}
            {pendingLiveOrder ? (
              <div className="mt-3 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2.5 text-sm text-cyan-100">
                Esperando {getHumanOrderLabel({
                  id: pendingLiveOrder.orderId,
                  displayCode: pendingLiveOrder.displayCode,
                })} en /pedidos...
              </div>
            ) : null}

            {verifiedLiveOrder ? (
              <div className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2.5 text-sm text-emerald-100">
                {getHumanOrderLabel({
                  id: verifiedLiveOrder.orderId,
                  displayCode: verifiedLiveOrder.displayCode,
                })} confirmada y visible para operación.
              </div>
            ) : null}
          </aside>
        </div>
      </div>

      {/* Barra inferior sticky — mobile only, cart con items */}
      {cart.length > 0 ? (
        <div className="fixed bottom-0 left-0 right-0 z-50 xl:hidden">
          <div className="border-t border-white/10 bg-[#0B0B0B]/95 px-4 py-3 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-neutral-500">Caja</p>
                <p className="truncate text-sm font-bold text-white">
                  {itemCount} {itemCount === 1 ? "item" : "items"} · {formatMoney(total)}
                </p>
              </div>
              <button
                onClick={() => {
                  document.getElementById("pos-checkout")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="shrink-0 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-2.5 text-sm font-bold text-emerald-300 transition-all hover:bg-emerald-400/15"
              >
                Ver caja
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Toast global */}
      {toast ? (
        <div className="pointer-events-none fixed right-6 top-6 z-[100]">
          <div
            className={[
              "min-w-[280px] rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-sm",
              toast.type === "success"
                ? "border-emerald-400/20 bg-[#07150f]/95 text-emerald-200"
                : "border-red-400/20 bg-[#1a0b0b]/95 text-red-200",
            ].join(" ")}
          >
            <p className="text-sm font-semibold">
              {toast.type === "success" ? "Venta registrada" : "Error operativo"}
            </p>
            <p className="mt-1 text-sm opacity-90">{toast.message}</p>
            {toast.detail ? (
              <p className="mt-1 text-xs opacity-75">{toast.detail}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
