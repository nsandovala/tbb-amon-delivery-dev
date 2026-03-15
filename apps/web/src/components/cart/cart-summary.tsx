"use client";

import { useMemo, useState } from "react";
import { useCartStore } from "@/lib/store/cart-store";
import { createOrder } from "@/lib/firebase/mutations/orders";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CartSummaryProps {
  tenantId: string;
}

export function CartSummary({ tenantId }: CartSummaryProps) {
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

  if (count === 0) return null;

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
        unitPrice: i.product.price,
      }));

      const orderId = await createOrder({
        tenantId,
        items: orderItems,
        subtotal,
        delivery,
        total,
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between text-sm text-neutral-400">
        <span>
          {count} {count === 1 ? "producto" : "productos"}
        </span>

        <button
          onClick={clearCart}
          disabled={isSubmitting}
          className="text-red-500 transition-colors hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Vaciar carrito
        </button>
      </div>

      <div className="grid gap-3">
        <div className="relative">
          <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Tu nombre completo"
            autoComplete="name"
            className={cn(
              "w-full rounded-xl border bg-white/5 py-3 pl-11 pr-4 text-white outline-none transition-colors placeholder:text-neutral-500",
              customerName.length > 0 && customerName.trim().length < 5
                ? "border-red-500/30 focus:border-red-500/50"
                : "border-white/10 focus:border-accent/40"
            )}
          />
        </div>

        <div className="relative">
          <Phone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          <input
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            placeholder="Tu WhatsApp (+569...)"
            inputMode="tel"
            autoComplete="tel"
            className={cn(
              "w-full rounded-xl border bg-white/5 py-3 pl-11 pr-4 text-white outline-none transition-colors placeholder:text-neutral-500",
              customerPhone.length > 0 && normalizedPhone.length < 8
                ? "border-red-500/30 focus:border-red-500/50"
                : "border-white/10 focus:border-accent/40"
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setFulfillmentType("delivery")}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl border px-4 py-3 font-semibold transition-all",
              fulfillmentType === "delivery"
                ? "border-accent/40 bg-accent/10 text-accent shadow-[0_0_16px_rgba(0,255,156,0.12)]"
                : "border-white/10 bg-white/5 text-neutral-300 hover:border-white/20 hover:text-white"
            )}
          >
            <Bike className="h-4 w-4" />
            Delivery
          </button>

          <button
            type="button"
            onClick={() => setFulfillmentType("pickup")}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl border px-4 py-3 font-semibold transition-all",
              fulfillmentType === "pickup"
                ? "border-accent/40 bg-accent/10 text-accent shadow-[0_0_16px_rgba(0,255,156,0.12)]"
                : "border-white/10 bg-white/5 text-neutral-300 hover:border-white/20 hover:text-white"
            )}
          >
            <Store className="h-4 w-4" />
            Retiro
          </button>
        </div>

        {fulfillmentType === "delivery" && (
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Dirección de entrega"
              autoComplete="street-address"
              className={cn(
                "w-full rounded-xl border bg-white/5 py-3 pl-11 pr-4 text-white outline-none transition-colors placeholder:text-neutral-500",
                address.length > 0 && address.trim().length < 8
                  ? "border-red-500/30 focus:border-red-500/50"
                  : "border-white/10 focus:border-accent/40"
              )}
            />
          </div>
        )}

        <div className="relative">
          <MessageSquare className="pointer-events-none absolute left-4 top-4 h-4 w-4 text-neutral-500" />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              fulfillmentType === "delivery"
                ? "Indicaciones del pedido (opcional)"
                : "Alguna indicación para el retiro (opcional)"
            }
            rows={3}
            className="w-full resize-none rounded-xl border border-white/10 bg-white/5 py-3 pl-11 pr-4 text-white outline-none transition-colors placeholder:text-neutral-500 focus:border-accent/40"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
        <div className="flex items-center justify-between text-sm text-neutral-400">
          <span>Subtotal</span>
          <span>${subtotal.toLocaleString("es-CL")}</span>
        </div>

        <div className="flex items-center justify-between text-sm text-neutral-400">
          <span>{fulfillmentType === "delivery" ? "Delivery" : "Retiro"}</span>
          <span>
            {delivery === 0 ? "Gratis" : `$${delivery.toLocaleString("es-CL")}`}
          </span>
        </div>

        <div className="mt-2 flex items-center justify-between border-t border-white/5 pt-3">
          <span className="text-lg font-semibold text-white">Total</span>
          <span className="text-2xl font-bold text-accent">
            ${total.toLocaleString("es-CL")}
          </span>
        </div>
      </div>

      <button
        onClick={handleCheckout}
        disabled={isSubmitting || !isFormValid}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-xl py-4 text-[15px] font-bold transition-all duration-200",
          isSubmitting || !isFormValid
            ? "cursor-not-allowed bg-white/10 text-white/50"
            : "bg-accent text-background shadow-[0_0_15px_rgba(0,255,156,0.3)] hover:bg-accent/90 hover:shadow-[0_0_25px_rgba(0,255,156,0.4)] active:scale-95"
        )}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Enviando pedido...
          </>
        ) : (
          <>
            <CheckCircle2 className="h-5 w-5" />
            Confirmar pedido
          </>
        )}
      </button>
    </div>
  );
}
