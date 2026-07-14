"use client";

import { useMemo, useState } from "react";
import { useCartStore } from "@/lib/store/cart-store";
import { createOrderApi } from "@/lib/api/orders";
import { getHumanOrderCode } from "@/lib/orders";
import { toast } from "sonner";
import {
  Loader2,
  MapPin,
  Phone,
  User,
  Mail,
  MessageSquare,
  Bike,
  Store,
  CheckCircle2,
  Wallet,
  CreditCard,
  Banknote,
  ArrowLeftRight,
  MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Validation helpers ──────────────────────────────────────── */

/** Minimum 3 non-space chars */
function isValidName(value: string): boolean {
  return value.trim().length >= 3;
}

/**
 * Accepts Chilean phone formats:
 *   +569XXXXXXXX  (12 chars)
 *   569XXXXXXXX   (11 chars)
 *   9XXXXXXXX     (9 chars)
 * Strips spaces, dashes, parens before checking.
 */
function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-()]/g, "");
}

function isValidPhone(raw: string): boolean {
  const n = normalizePhone(raw);
  // +569 + 8 digits
  if (/^\+569\d{8}$/.test(n)) return true;
  // 569 + 8 digits
  if (/^569\d{8}$/.test(n)) return true;
  // 9 + 8 digits (mobile without prefix)
  if (/^9\d{8}$/.test(n)) return true;
  return false;
}

function isValidEmail(value: string): boolean {
  if (value.trim().length === 0) return true; // optional
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidAddress(value: string): boolean {
  return value.trim().length >= 5;
}

/* ─── Payment methods for storefront ──────────────────────────── */

type StorefrontPaymentMethod = "cash" | "transfer" | "card";

const PAYMENT_OPTIONS: {
  id: StorefrontPaymentMethod;
  label: string;
  icon: typeof Banknote;
  enabled: boolean;
  disabledLabel?: string;
}[] = [
  { id: "cash", label: "Efectivo", icon: Banknote, enabled: true },
  { id: "transfer", label: "Transferencia", icon: ArrowLeftRight, enabled: true },
  {
    id: "card",
    label: "Tarjeta",
    icon: CreditCard,
    enabled: false,
    disabledLabel: "Próximamente",
  },
];

/* ─── Component ───────────────────────────────────────────────── */

interface CartSummaryProps {
  tenantId: string;
  onBack?: () => void;
}

export function CartSummary({ tenantId, onBack }: CartSummaryProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [fulfillmentType, setFulfillmentType] = useState<"delivery" | "pickup">(
    "delivery"
  );
  const [paymentMethod, setPaymentMethod] =
    useState<StorefrontPaymentMethod | null>(null);
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  /* Touched state — show errors only after user interacts */
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const markTouched = (field: string) =>
    setTouched((prev) => ({ ...prev, [field]: true }));

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

  /* ─── Validation state ─────────────────────────────────────── */

  const normalizedPhone = normalizePhone(customerPhone);
  const nameOk = isValidName(customerName);
  const phoneOk = isValidPhone(customerPhone);
  const emailOk = isValidEmail(customerEmail);
  const addressOk =
    fulfillmentType === "pickup" || isValidAddress(address);
  const paymentOk = paymentMethod !== null;

  const isFormValid = nameOk && phoneOk && emailOk && addressOk && paymentOk;

  /** Human-readable reason when button is disabled */
  function getDisabledReason(): string | null {
    if (!nameOk) return "Completa tu nombre";
    if (!phoneOk) return "Ingresa tu WhatsApp";
    if (!emailOk) return "Corrige el email";
    if (!addressOk) return "Ingresa dirección de entrega";
    if (!paymentOk) return "Selecciona método de pago";
    return null;
  }

  /* ─── Submit ───────────────────────────────────────────────── */

  const handleCheckout = async () => {
    if (isSubmitting) return;

    if (!isFormValid) {
      toast.error(getDisabledReason() ?? "Completa los datos del pedido.");
      return;
    }

    setIsSubmitting(true);

    try {
      const orderItems = items.map((i) => ({
        productId: i.product.id,
        qty: i.quantity,
      }));

      const { orderId, displayCode } = await createOrderApi({
        tenantId,
        items: orderItems,
        fulfillmentType,
        customer: {
          name: customerName.trim(),
          phone: normalizedPhone,
          email: customerEmail.trim() || undefined,
          address: fulfillmentType === "delivery" ? address.trim() : "",
          notes: notes.trim(),
        },
        paymentMethod,
      });

      clearCart();
      closeCart();

      toast.success(`Pedido recibido #${getHumanOrderCode({ orderId, displayCode })}`, {
        description:
          fulfillmentType === "delivery"
            ? "Tu pedido quedó en cola. Te contactaremos por WhatsApp."
            : "Tu pedido quedó registrado para retiro.",
      });

      setCustomerName("");
      setCustomerPhone("");
      setCustomerEmail("");
      setAddress("");
      setNotes("");
      setPaymentMethod(null);
      setFulfillmentType("delivery");
      setTouched({});
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Error desconocido";
      toast.error("No pudimos crear tu pedido. Intenta nuevamente.", {
        description: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ─── Styles ───────────────────────────────────────────────── */

  const inputBase =
    "w-full rounded-xl border bg-white/5 py-3 pl-11 pr-4 text-sm text-white outline-none transition-colors placeholder:text-neutral-500";
  const inputBorderDefault = "border-white/10 focus:border-accent/40";
  const inputBorderError = "border-red-500/30 focus:border-red-500/50";

  const showNameError = touched.name && !nameOk && customerName.length > 0;
  const showPhoneError = touched.phone && !phoneOk && customerPhone.length > 0;
  const showEmailError = touched.email && !emailOk && customerEmail.length > 0;
  const showAddressError =
    touched.address &&
    fulfillmentType === "delivery" &&
    !isValidAddress(address) &&
    address.length > 0;

  /* ─── Render ───────────────────────────────────────────────── */

  const disabledReason = getDisabledReason();

  return (
    <div className="flex flex-col gap-4">
      {/* Mini order summary at top */}
      <div className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-400">
            {count} {count === 1 ? "producto" : "productos"}
          </span>
          {onBack && (
            <button
              onClick={onBack}
              className="text-xs font-medium text-accent/80 transition-colors hover:text-accent"
            >
              Editar
            </button>
          )}
        </div>
        <span className="text-sm font-bold text-white">
          ${subtotal.toLocaleString("es-CL")}
        </span>
      </div>

      {/* ── Customer data ──────────────────────────────────────── */}
      <div className="grid gap-2.5">
        <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">
          Tus datos
        </p>

        {/* Name */}
        <div>
          <div className="relative">
            <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              onBlur={() => markTouched("name")}
              placeholder="Tu nombre completo"
              autoComplete="name"
              className={cn(
                inputBase,
                showNameError ? inputBorderError : inputBorderDefault
              )}
            />
          </div>
          {showNameError && (
            <p className="mt-1 text-xs text-red-400/80">
              Mínimo 3 caracteres
            </p>
          )}
        </div>

        {/* Phone */}
        <div>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              onBlur={() => markTouched("phone")}
              placeholder="WhatsApp (+569 1234 5678)"
              inputMode="tel"
              autoComplete="tel"
              className={cn(
                inputBase,
                showPhoneError ? inputBorderError : inputBorderDefault
              )}
            />
          </div>
          {showPhoneError && (
            <p className="mt-1 text-xs text-red-400/80">
              Formato: +569XXXXXXXX, 569XXXXXXXX o 9XXXXXXXX
            </p>
          )}
        </div>

        {/* Email */}
        <div>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            <input
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              onBlur={() => markTouched("email")}
              placeholder="Email (opcional)"
              inputMode="email"
              autoComplete="email"
              className={cn(
                inputBase,
                showEmailError ? inputBorderError : inputBorderDefault
              )}
            />
          </div>
          {showEmailError && (
            <p className="mt-1 text-xs text-red-400/80">
              Ingresa un email válido
            </p>
          )}
        </div>
      </div>

      {/* ── Fulfillment ────────────────────────────────────────── */}
      <div className="grid gap-2.5">
        <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">
          Tipo de entrega
        </p>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setFulfillmentType("delivery")}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all",
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
              "flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all",
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
          <div>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onBlur={() => markTouched("address")}
                placeholder="Dirección de entrega"
                autoComplete="street-address"
                className={cn(
                  inputBase,
                  showAddressError ? inputBorderError : inputBorderDefault
                )}
              />
            </div>
            {showAddressError && (
              <p className="mt-1 text-xs text-red-400/80">
                Ingresa una dirección válida (mín. 5 caracteres)
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Payment ────────────────────────────────────────────── */}
      <div className="grid gap-2.5">
        <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">
          Método de pago
        </p>
        <div className="grid grid-cols-2 gap-2">
          {PAYMENT_OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = paymentMethod === option.id;
            const disabled = !option.enabled;

            return (
              <button
                key={option.id}
                type="button"
                disabled={disabled}
                onClick={() => setPaymentMethod(option.id)}
                className={cn(
                  "relative flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all",
                  disabled
                    ? "cursor-not-allowed border-white/5 bg-white/[0.02] text-neutral-600"
                    : active
                      ? "border-accent/40 bg-accent/10 text-accent shadow-[0_0_16px_rgba(0,255,156,0.12)]"
                      : "border-white/10 bg-white/5 text-neutral-300 hover:border-white/20 hover:text-white"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {disabled && option.disabledLabel ? (
                  <span className="flex flex-col items-center leading-none">
                    <span className="text-[10px] text-neutral-600">
                      {option.label}
                    </span>
                    <span className="text-[9px] italic text-neutral-600">
                      {option.disabledLabel}
                    </span>
                  </span>
                ) : (
                  option.label
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Notes ──────────────────────────────────────────────── */}
      <div className="relative">
        <MessageSquare className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-neutral-500" />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={
            fulfillmentType === "delivery"
              ? "Indicaciones del pedido (opcional)"
              : "Alguna indicación para el retiro (opcional)"
          }
          rows={2}
          className="w-full resize-none rounded-xl border border-white/10 bg-white/5 py-3 pl-11 pr-4 text-sm text-white outline-none transition-colors placeholder:text-neutral-500 focus:border-accent/40"
        />
      </div>

      {/* ── Trust copy ─────────────────────────────────────────── */}
      <div className="flex items-start gap-2.5 rounded-xl border border-white/5 bg-white/[0.02] px-3.5 py-2.5">
        <MessageCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent/60" />
        <p className="text-[11px] leading-relaxed text-neutral-500">
          Al confirmar, te contactaremos por WhatsApp para coordinar tu pedido.
        </p>
      </div>

      {/* ── Totals ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
        <div className="flex items-center justify-between text-sm text-neutral-400">
          <span>Subtotal</span>
          <span>${subtotal.toLocaleString("es-CL")}</span>
        </div>

        <div className="flex items-center justify-between text-sm text-neutral-400">
          <span>{fulfillmentType === "delivery" ? "Delivery" : "Retiro"}</span>
          <span>
            {delivery === 0
              ? "Gratis"
              : `$${delivery.toLocaleString("es-CL")}`}
          </span>
        </div>

        {paymentMethod && (
          <div className="flex items-center justify-between text-sm text-neutral-400">
            <span>Pago</span>
            <span>
              {{ cash: "Efectivo", transfer: "Transferencia", card: "Tarjeta" }[
                paymentMethod
              ]}
            </span>
          </div>
        )}

        <div className="mt-1.5 flex items-center justify-between border-t border-white/5 pt-2.5">
          <span className="text-base font-semibold text-white">Total</span>
          <span className="text-2xl font-bold text-accent">
            ${total.toLocaleString("es-CL")}
          </span>
        </div>
      </div>

      {/* ── Submit ──────────────────────────────────────────────── */}
      <button
        onClick={handleCheckout}
        disabled={isSubmitting || !isFormValid}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-1 rounded-xl py-4 text-[15px] font-bold transition-all duration-200",
          isSubmitting || !isFormValid
            ? "cursor-not-allowed bg-white/10 text-white/50"
            : "bg-accent text-background shadow-[0_0_15px_rgba(0,255,156,0.3)] hover:bg-accent/90 hover:shadow-[0_0_25px_rgba(0,255,156,0.4)] active:scale-95"
        )}
      >
        {isSubmitting ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Enviando pedido...
          </span>
        ) : (
          <>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              Confirmar pedido • ${total.toLocaleString("es-CL")}
            </span>
            {disabledReason && (
              <span className="text-[11px] font-normal text-white/40">
                {disabledReason}
              </span>
            )}
          </>
        )}
      </button>

      {/* Clear cart link */}
      <div className="flex justify-center pb-2">
        <button
          onClick={() => {
            clearCart();
            onBack?.();
          }}
          disabled={isSubmitting}
          className="text-xs text-neutral-500 transition-colors hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Vaciar carrito
        </button>
      </div>
    </div>
  );
}
