"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { normalizeChileanPhone, isValidChileanPhone } from "../../lib/phone";
import { auth, db } from "../../lib/firebase/client";
import {
  isAuthorizationLost,
  tearDownAuthorizedSession,
} from "../../lib/auth/handle-authz-loss";
import { createPosSaleApi, getOrderApi, updateOrderStatusApi } from "../../lib/api/orders";
import { useActiveTenant } from "@/components/tenant-provider";
import { StoreStatusStrip } from "@/components/store-status-strip";
import { getHumanOrderLabel } from "../../lib/orders";
import { OrderItemsSummary } from "../../components/order-items-summary";
import { PosReceiptDialog } from "../../components/pos/pos-receipt-dialog";
import { receiptFromOrder, type PosReceipt } from "../../lib/pos-receipt";
import { getOperationalDayStart, toDate } from "../../lib/time";
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
  Moon,
  Sun,
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
  items?: { productId?: string; productName?: string; name?: string; qty?: number; unitPrice?: number }[];
  customer?: {
    name?: string;
    phone?: string;
  };
  createdAt?: unknown;
  totals?: {
    subtotal?: number;
    delivery?: number;
    deliveryFee?: number;
    total?: number;
  };
};

const COUNTER_CUSTOMER_NAME = "Cliente mostrador";
type AcquisitionSource = "instagram" | "facebook" | "whatsapp" | "in_person" | "other";

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
  const { tenantId } = useActiveTenant();
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
  const [customerMode, setCustomerMode] = useState<"counter" | "details">("counter");

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
    detail?: string;
  } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer" | "card" | "pending">("pending");
  const [acquisitionSource, setAcquisitionSource] = useState<AcquisitionSource | "">("");
  const [acquisitionCampaign, setAcquisitionCampaign] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [todayOrders, setTodayOrders] = useState<PosOrder[]>([]);
  const [posHistoryOrders, setPosHistoryOrders] = useState<PosOrder[]>([]);
  const [pendingLiveOrder, setPendingLiveOrder] = useState<{
    orderId: string;
    displayCode: string;
  } | null>(null);
  const [verifiedLiveOrder, setVerifiedLiveOrder] = useState<{
    orderId: string;
    displayCode: string;
  } | null>(null);
  const [closingIds, setClosingIds] = useState<Set<string>>(new Set());
  const [receipt, setReceipt] = useState<PosReceipt | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [operatorEmail, setOperatorEmail] = useState("Operador");

  const startOfDay = useMemo(() => {
    return Timestamp.fromDate(getOperationalDayStart(new Date()));
  }, []);

  const normalizedPhone = customerPhone.trim()
    ? normalizeChileanPhone(customerPhone)
    : null;
  const isPickupCounterSale =
    fulfillmentType === "pickup" &&
    customerMode === "counter";
  const effectiveCustomerName =
    isPickupCounterSale ||
    (fulfillmentType === "pickup" && !customerName.trim())
      ? COUNTER_CUSTOMER_NAME
      : customerName.trim();
  const phoneForOrder = isPickupCounterSale ? null : normalizedPhone;
  const phoneRequired = fulfillmentType === "delivery";
  const phoneOk = isPickupCounterSale
    ? true
    : phoneRequired
    ? isValidChileanPhone(customerPhone)
    : customerPhone.trim().length === 0 || isValidChileanPhone(customerPhone);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("amon-operations-theme");
    if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setOperatorEmail(user?.email ?? "Operador");
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    document.documentElement.dataset.amonTheme = theme;
  }, [theme]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

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
        if (isAuthorizationLost(error)) {
          setTodayOrders([]);
          void tearDownAuthorizedSession();
          return;
        }
        console.error("Error cargando órdenes del día:", error);
      }
    );

    return () => unsub();
  }, [startOfDay]);

  useEffect(() => {
    const ref = collection(db, `tenants/${tenantId}/orders`);
    // Single-field query avoids introducing a composite-index requirement.
    const q = query(ref, where("channel", "==", "admin_pos"));
    return onSnapshot(
      q,
      (snapshot) => setPosHistoryOrders(snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<PosOrder, "id">),
      }))),
      (error) => {
        if (isAuthorizationLost(error)) {
          setPosHistoryOrders([]);
          void tearDownAuthorizedSession();
          return;
        }
        console.error("Error cargando historial POS:", error);
      }
    );
  }, []);

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
    phoneOk &&
    (fulfillmentType === "pickup" ||
      (customerName.trim().length >= 2 && address.trim().length >= 6));

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

  const recentPosHistory = useMemo(
    () => [...posHistoryOrders]
      .sort((a, b) => (toDate(b.createdAt)?.getTime() ?? 0) - (toDate(a.createdAt)?.getTime() ?? 0))
      .slice(0, 50),
    [posHistoryOrders]
  );

  const catalogNames = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p.name])),
    [products]
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
    setAcquisitionSource("");
    setAcquisitionCampaign("");
    setCustomerMode("counter");
    setVerifiedLiveOrder(null);
  }

  function startNewSale() {
    setIsReceiptOpen(false);
    clearPos();
    document.getElementById("pos-catalog")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openStoredReceipt(order: PosOrder) {
    setReceipt(receiptFromOrder(order));
    setIsReceiptOpen(true);
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
      const receiptItems = cart.map((item) => ({
        name: item.product.name,
        quantity: item.quantity,
        unitPrice: item.product.price,
      }));
      let receiptDetails: Omit<PosReceipt, "orderId" | "displayCode" | "createdAt"> = {
        customerName: effectiveCustomerName,
        customerPhone: phoneForOrder ?? undefined,
        fulfillmentType,
        paymentLabel: paymentLabels[paymentMethod],
        acquisitionLabel: acquisitionSource
          ? ({
              instagram: "Instagram",
              facebook: "Facebook",
              whatsapp: "WhatsApp",
              in_person: "Presencial",
              other: "Otro",
            } as const)[acquisitionSource]
          : undefined,
        acquisitionCampaign: acquisitionCampaign.trim() || undefined,
        address: fulfillmentType === "delivery" ? address.trim() : undefined,
        notes: notes.trim() || undefined,
        items: receiptItems,
        subtotal,
        delivery,
        total,
      };

      const { orderId, displayCode } = await createPosSaleApi({
        tenantId,
        items: orderItems,
        customer: {
          name: effectiveCustomerName,
          ...(phoneForOrder ? { phone: phoneForOrder } : {}),
          email: customerEmail.trim() || undefined,
          address: fulfillmentType === "delivery" ? address.trim() : "",
          notes: notes.trim(),
        },
        fulfillmentType,
        paymentMethod,
        ...(acquisitionSource ? { acquisitionSource } : {}),
        ...(acquisitionCampaign.trim() ? { acquisitionCampaign: acquisitionCampaign.trim() } : {}),
      });

      // Use the saved snapshot (backend price/totals) for the customer-facing receipt.
      // If the read fails, preserve the sale and fall back to the values already shown in POS.
      try {
        const savedOrder = await getOrderApi(orderId, tenantId);
        const sourceLabels = {
          instagram: "Instagram",
          facebook: "Facebook",
          whatsapp: "WhatsApp",
          in_person: "Presencial",
          other: "Otro",
        } as const;
        const savedPaymentLabels = {
          cash: "Efectivo",
          transfer: "Transferencia",
          card: "Tarjeta",
          pending: "Pendiente",
        } as const;
        receiptDetails = {
          ...receiptDetails,
          customerName: savedOrder.customer?.name || receiptDetails.customerName,
          customerPhone: savedOrder.customer?.phone || receiptDetails.customerPhone,
          fulfillmentType: savedOrder.fulfillmentType || receiptDetails.fulfillmentType,
          paymentLabel: savedOrder.paymentMethod
            ? savedPaymentLabels[savedOrder.paymentMethod]
            : receiptDetails.paymentLabel,
          acquisitionLabel: savedOrder.acquisitionSource
            ? sourceLabels[savedOrder.acquisitionSource]
            : undefined,
          acquisitionCampaign: savedOrder.acquisitionCampaign || undefined,
          address: savedOrder.customer?.address || undefined,
          notes: savedOrder.customer?.notes || undefined,
          items: savedOrder.items?.map((item) => ({
            name: item.name || "Producto",
            quantity: item.qty ?? 0,
            unitPrice: item.unitPrice ?? 0,
          })) ?? receiptDetails.items,
          subtotal: savedOrder.totals?.subtotal ?? receiptDetails.subtotal,
          delivery: savedOrder.totals?.deliveryFee ?? savedOrder.totals?.delivery ?? receiptDetails.delivery,
          total: savedOrder.totals?.total ?? receiptDetails.total,
        };
      } catch (receiptReadError) {
        console.warn("Se usará el resumen POS para el comprobante:", receiptReadError);
      }

      setPendingLiveOrder({ orderId, displayCode });
      setReceipt({ orderId, displayCode, createdAt: new Date(), ...receiptDetails });
      setIsReceiptOpen(true);
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
    <main data-admin-surface="pos" data-theme={theme} className="pos-root min-h-screen bg-[#050505] text-white">
      <div className={["mx-auto max-w-[1600px] px-4 py-5", cart.length > 0 ? "pb-24 xl:pb-5" : ""].join(" ")}>

        <StoreStatusStrip />

        {/* Header compacto */}
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-emerald-400/80">Punto de venta · TBB</p>
            <h1 className="mt-0.5 text-2xl font-black tracking-tight text-white">The Best Burger</h1>
            <p className="mt-1 text-xs text-neutral-400">
              Valparaíso · Operando: {operatorEmail} · {itemCount > 0 ? `${itemCount} ${itemCount === 1 ? "producto" : "productos"} en caja` : "caja lista"}
            </p>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {receipt && !isReceiptOpen ? (
              <button type="button" className="pos-theme-toggle" onClick={() => setIsReceiptOpen(true)}>
                Último comprobante · #{receipt.displayCode}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setTheme((current) => {
                const next = current === "dark" ? "light" : "dark";
                window.localStorage.setItem("amon-operations-theme", next);
                return next;
              })}
              aria-label={`Cambiar a modo ${theme === "dark" ? "claro" : "oscuro"}`}
              className="pos-theme-toggle"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              Modo {theme === "dark" ? "claro" : "oscuro"}
            </button>
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
          <section id="pos-catalog" className="pos-panel rounded-2xl border border-white/10 bg-[#101010] p-4">

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
                            ? "border-[#8c713f] bg-[#8c713f]/15 text-[#d8bd82]"
                            : "border-[#8c713f]/70 bg-[#8c713f]/10 text-[#d8bd82] hover:border-[#c4a46a] hover:bg-[#8c713f]/20 hover:text-[#f0d296]",
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
                          <OrderItemsSummary
                            items={sale.items}
                            catalogNames={catalogNames}
                            variant="inline"
                          />
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

            <section className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-3" aria-labelledby="pos-history-title">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <p id="pos-history-title" className="text-[11px] uppercase tracking-[0.16em] text-neutral-300">Historial POS</p>
                  <p className="mt-0.5 text-[11px] text-neutral-500">Ventas guardadas · comprobantes internos</p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-neutral-400">{recentPosHistory.length}</span>
              </div>
              {recentPosHistory.length === 0 ? (
                <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-xs text-neutral-500">Todavía no hay ventas POS registradas.</p>
              ) : (
                <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                  {recentPosHistory.map((sale) => {
                    const savedReceipt = receiptFromOrder(sale);
                    return (
                      <div key={sale.id} className="flex items-center gap-3 rounded-lg border border-white/8 bg-[#0D0D0D] px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-white">{getHumanOrderLabel({ id: sale.id, displayCode: sale.displayCode })} · {savedReceipt.customerName}</p>
                          <p className="mt-0.5 text-[11px] text-neutral-500">
                            {savedReceipt.createdAt ? new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short", timeZone: "America/Santiago" }).format(savedReceipt.createdAt) : "Fecha sin registro"}
                            {" · "}{paymentLabels[sale.paymentMethod ?? "pending"]}{" · "}{sale.status === "cancelled" ? "Cancelada" : sale.status === "delivered" ? "Entregada" : "En curso"}
                          </p>
                        </div>
                        <strong className="shrink-0 text-xs text-emerald-300">{formatMoney(sale.totals?.total ?? sale.total)}</strong>
                        <button type="button" className="pos-secondary-button shrink-0 px-2.5 py-1.5 text-[11px]" onClick={() => openStoredReceipt(sale)}>Comprobante</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </section>

          {/* CAJA OPERATIVA */}
          <aside id="pos-checkout" className="pos-panel rounded-2xl border border-white/10 bg-[#101010] p-4">

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
                        className="rounded-lg border border-[#8c713f]/70 bg-[#8c713f]/10 p-1.5 text-[#d8bd82] hover:bg-[#8c713f]/20"
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
                  type="button"
                  onClick={() => {
                    setFulfillmentType("delivery");
                    setCustomerMode("details");
                    if (customerName.trim() === COUNTER_CUSTOMER_NAME) {
                      setCustomerName("");
                    }
                  }}
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
                  type="button"
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
                        setCustomerMode("counter");
                      }}
                      className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-200 transition-all hover:bg-emerald-400/15"
                    >
                      Cliente mostrador
                    </button>
                  </div>

                  {customerMode === "counter" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomerMode("details");
                        if (customerName.trim() === COUNTER_CUSTOMER_NAME) {
                          setCustomerName("");
                        }
                      }}
                      className="mt-3 text-[11px] font-semibold text-neutral-300 transition-colors hover:text-white"
                    >
                      Agregar datos del cliente
                    </button>
                  ) : (
                    <p className="mt-3 text-[11px] font-semibold text-emerald-200/80">
                      Datos del cliente activos
                    </p>
                  )}
                </div>
              ) : null}

              {fulfillmentType === "delivery" || customerMode === "details" ? (
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

              <div className="space-y-2 border-t border-white/8 pt-3" aria-label="Origen del pedido">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="pos-acquisition-source" className="text-xs font-semibold text-neutral-200">
                    Origen del pedido
                  </label>
                  <span className="text-[10px] text-neutral-500">Opcional · se mide en Métricas</span>
                </div>
                <select
                  id="pos-acquisition-source"
                  value={acquisitionSource}
                  onChange={(event) => {
                    const next = event.target.value as AcquisitionSource | "";
                    setAcquisitionSource(next);
                    if (!next || (next !== "instagram" && next !== "facebook" && next !== "whatsapp")) {
                      setAcquisitionCampaign("");
                    }
                  }}
                  className="w-full rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/30"
                >
                  <option value="">Sin atribuir</option>
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="in_person">Presencial</option>
                  <option value="other">Otro</option>
                </select>
                {acquisitionSource && ["instagram", "facebook", "whatsapp"].includes(acquisitionSource) ? (
                  <input
                    value={acquisitionCampaign}
                    onChange={(event) => setAcquisitionCampaign(event.target.value.slice(0, 100))}
                    placeholder="Campaña o publicación (opcional)"
                    maxLength={100}
                    className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white outline-none placeholder:text-neutral-500 focus:border-emerald-400/30"
                  />
                ) : null}
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

      {receipt && isReceiptOpen ? <PosReceiptDialog receipt={receipt} onClose={() => setIsReceiptOpen(false)} onNewSale={startNewSale} /> : null}

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
