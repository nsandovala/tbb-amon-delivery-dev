"use client";

import { useMemo, useState } from "react";
import { useCartStore } from "@/lib/store/cart-store";
import { createOrderApi } from "@/lib/api/orders";
import { toast } from "sonner";
import {
  Loader2,
  MapPin,
  Phone,
  User,
  MessageSquare,
  Bike,
  Store,
  CheckCircle2,
  Receipt,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CartCheckoutFormProps {
  tenantId: string;
}

export function CartCheckoutForm({ tenantId }: CartCheckoutFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [fulfillmentType, setFulfillmentType] = useState<"delivery" | "pickup">(
    "delivery"
  );
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  const clearCart = useCartStore((s) => s.clearCart);
  const closeCart = useCartStore((s) => s.closeCart);
  const items = useCartStore((s) => s.items);

  const count = useMemo(
    () => items.reduce((acc, i) => acc + i.quantity, 0),
    [items]
  );

  const subtotal = useMemo(
    () => items.reduce((acc, i) => acc + i.product.price * i.quantity, 0),
    [items]
  );

  const delivery = fulfillmentType === "delivery" ? 1500 : 0;
  const total = subtotal + delivery;

  const normalizedPhone = customerPhone.replace(/\s+/g, "").trim();

  const isFormValid =
    customerName.trim().length >= 5 &&
    normalizedPhone.length >= 8 &&
    (fulfillmentType === "pickup" || address.trim().length >= 8);

  const handleCheckout = async () => {
    if (!isFormValid) {
      toast.error("Completa los datos del pedido antes de continuar.");
      return;
    }

    setIsSubmitting(true);

    try {
      const orderItems = items.map((i) => ({
        productId: i.product.id,
        qty: i.quantity,
      }));

      const { orderId } = await createOrderApi({
        tenantId,
        items: orderItems,
        fulfillmentType,
        customer: {
          name: customerName.trim(),
          phone: normalizedPhone,
          address: fulfillmentType === "delivery" ? address.trim() : "",
          notes: notes.trim(),
        },
      });

      clearCart();
      closeCart();

      toast.success(`Pedido recibido #${orderId.slice(0, 6).toUpperCase()}`, {
        description:
          fulfillmentType === "delivery"
            ? "Tu pedido quedó en cola y listo para preparación."
            : "Tu pedido quedó registrado para retiro.",
      });

      setCustomerName("");
      setCustomerPhone("");
      setAddress("");
      setNotes("");
      setFulfillmentType("delivery");
    } catch (err) {
      console.error(err);
      toast.error("No pudimos crear tu pedido. Intenta nuevamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputBase =
    "w-full rounded-xl border bg-white/[0.03] py-3 pl-11 pr-4 text-[13px] text-white outline-none transition-all placeholder:text-neutral-600";
  const inputValid =
    "border-white/[0.06] focus:border-accent/30 focus:bg-white/[0.05] focus:shadow-[0_0_0_4px_rgba(0,255,156,0.04)]";
  const inputError =
    "border-red-500/20 focus:border-red-500/40 focus:bg-white/[0.05] focus:shadow-[0_0_0_4px_rgba(239,68,68,0.04)]";

  return (
    <div className="flex flex-col gap-5">
      {/* Section: Customer Info */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <User className="h-3.5 w-3.5 text-neutral-500" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
            Tus datos
          </span>
        </div>

        <div className="grid gap-2.5">
          <div className="relative">
            <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-600" />
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nombre completo"
              autoComplete="name"
              className={cn(
                inputBase,
                customerName.length > 0 && customerName.trim().length < 5
                  ? inputError
                  : inputValid
              )}
            />
          </div>

          <div className="relative">
            <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-600" />
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="WhatsApp (+569...)"
              inputMode="tel"
              autoComplete="tel"
              className={cn(
                inputBase,
                customerPhone.length > 0 && normalizedPhone.length < 8
                  ? inputError
                  : inputValid
              )}
            />
          </div>
        </div>
      </div>

      {/* Section: Fulfillment Type */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Bike className="h-3.5 w-3.5 text-neutral-500" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
            Entrega
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setFulfillmentType("delivery")}
            className={cn(
              "group relative flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 transition-all duration-200",
              fulfillmentType === "delivery"
                ? "border-accent/25 bg-accent/[0.06] text-accent shadow-[0_0_20px_rgba(0,255,156,0.06)]"
                : "border-white/[0.06] bg-white/[0.02] text-neutral-400 hover:border-white/10 hover:bg-white/[0.04] hover:text-neutral-200"
            )}
          >
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg border transition-all",
                fulfillmentType === "delivery"
                  ? "border-accent/20 bg-accent/10"
                  : "border-white/[0.06] bg-white/[0.03] group-hover:border-white/10"
              )}
            >
              <Bike className="h-3.5 w-3.5" />
            </div>
            <span className="text-xs font-semibold">Delivery</span>
          </button>

          <button
            type="button"
            onClick={() => setFulfillmentType("pickup")}
            className={cn(
              "group relative flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 transition-all duration-200",
              fulfillmentType === "pickup"
                ? "border-accent/25 bg-accent/[0.06] text-accent shadow-[0_0_20px_rgba(0,255,156,0.06)]"
                : "border-white/[0.06] bg-white/[0.02] text-neutral-400 hover:border-white/10 hover:bg-white/[0.04] hover:text-neutral-200"
            )}
          >
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg border transition-all",
                fulfillmentType === "pickup"
                  ? "border-accent/20 bg-accent/10"
                  : "border-white/[0.06] bg-white/[0.03] group-hover:border-white/10"
              )}
            >
              <Store className="h-3.5 w-3.5" />
            </div>
            <span className="text-xs font-semibold">Retiro</span>
          </button>
        </div>

        {fulfillmentType === "delivery" && (
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-600" />
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Dirección de entrega"
              autoComplete="street-address"
              className={cn(
                inputBase,
                address.length > 0 && address.trim().length < 8
                  ? inputError
                  : inputValid
              )}
            />
          </div>
        )}

        <div className="relative">
          <MessageSquare className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-neutral-600" />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              fulfillmentType === "delivery"
                ? "Indicaciones del pedido (opcional)"
                : "Indicaciones para el retiro (opcional)"
            }
            rows={2}
            className={cn(
              "w-full resize-none rounded-xl border border-white/[0.06] bg-white/[0.03] py-3 pl-11 pr-4 text-[13px] text-white outline-none transition-all placeholder:text-neutral-600",
              "focus:border-accent/30 focus:bg-white/[0.05] focus:shadow-[0_0_0_4px_rgba(0,255,156,0.04)]"
            )}
          />
        </div>
      </div>

      {/* Section: Order Summary */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.05] bg-white/[0.02]">
        <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        <div className="flex items-center gap-2 px-5 pt-4">
          <Receipt className="h-3.5 w-3.5 text-neutral-500" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
            Resumen
          </span>
        </div>

        <div className="flex flex-col gap-1 px-5 py-4">
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-neutral-400">
              Subtotal ({count} {count === 1 ? "producto" : "productos"})
            </span>
            <span className="font-medium tabular-nums text-neutral-300">
              ${subtotal.toLocaleString("es-CL")}
            </span>
          </div>

          <div className="flex items-center justify-between text-[13px]">
            <span className="text-neutral-400">
              {fulfillmentType === "delivery" ? "Delivery" : "Retiro en local"}
            </span>
            <span
              className={cn(
                "font-medium tabular-nums",
                delivery === 0 ? "text-emerald-400" : "text-neutral-300"
              )}
            >
              {delivery === 0
                ? "Gratis"
                : `$${delivery.toLocaleString("es-CL")}`}
            </span>
          </div>
        </div>

        <div className="mx-5 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        <div className="flex items-center justify-between px-5 py-4">
          <span className="text-sm font-semibold tracking-tight text-white">
            Total a pagar
          </span>
          <span className="text-xl font-bold tabular-nums tracking-tight text-accent">
            ${total.toLocaleString("es-CL")}
          </span>
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={handleCheckout}
        disabled={isSubmitting || !isFormValid}
        className={cn(
          "group relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-2xl py-4 text-sm font-bold transition-all duration-300",
          isSubmitting || !isFormValid
            ? "cursor-not-allowed bg-white/[0.05] text-white/30 border border-white/[0.06]"
            : "border border-[#7DFFD8]/25 bg-[linear-gradient(180deg,#19FFAE_0%,#00E08C_100%)] text-black shadow-[0_12px_32px_rgba(0,255,156,0.18),inset_0_1px_0_rgba(255,255,255,0.25)] hover:shadow-[0_16px_40px_rgba(0,255,156,0.25),inset_0_1px_0_rgba(255,255,255,0.35)] hover:scale-[1.01] active:scale-[0.98]"
        )}
      >
        {!isSubmitting && isFormValid && (
          <span className="pointer-events-none absolute inset-x-8 top-0 h-px bg-white/40 opacity-70" />
        )}

        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Enviando pedido...
          </>
        ) : (
          <>
            <CheckCircle2 className="h-4 w-4 transition-transform group-hover:scale-110" />
            <span>Confirmar pedido</span>
            <ArrowRight className="h-4 w-4 opacity-60 transition-transform group-hover:translate-x-0.5" />
          </>
        )}
      </button>

      {/* Trust hint */}
      <p className="text-center text-[10px] font-medium leading-relaxed text-neutral-600">
        Al confirmar, aceptas que te contactaremos por WhatsApp para coordinar{" "}
        {fulfillmentType === "delivery" ? "la entrega" : "el retiro"}.
      </p>
    </div>
  );
}
