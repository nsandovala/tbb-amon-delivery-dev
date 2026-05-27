"use client";

import { useMemo, useState } from "react";
import { useCartStore } from "@/lib/store/cart-store";
import { CartItem } from "./cart-item";
import { CartSummary } from "./cart-summary";
import { X, ShoppingBag, ChevronRight, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface CartDrawerProps {
  tenantId: string;
}


export function CartDrawer({ tenantId }: CartDrawerProps) {
  const isOpen = useCartStore((s) => s.isOpen);
  const closeCart = useCartStore((s) => s.closeCart);
  const items = useCartStore((s) => s.items);

  const [step, setStep] = useState<"cart" | "checkout">("cart");

  // Reset step when drawer closes or cart empties
  const effectiveStep = !isOpen || items.length === 0 ? "cart" : step;

  const count = useMemo(
    () => items.reduce((acc, i) => acc + i.quantity, 0),
    [items]
  );

  const subtotal = useMemo(
    () => items.reduce((acc, i) => acc + i.product.price * i.quantity, 0),
    [items]
  );

  return (
    <>
      {/* Overlay */}
      <div
        className={cn(
          "fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm transition-opacity duration-300",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={closeCart}
      />

      {/* Drawer */}
      <aside
        className={cn(
          "fixed z-[70] flex min-h-0 flex-col border-white/10 bg-[#0b0b0c] shadow-2xl transition-transform duration-300 ease-in-out",
          "md:right-0 md:top-0 md:bottom-0 md:w-[420px] md:border-l",
          "max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:h-[90svh] max-md:rounded-t-3xl max-md:border-t",
          isOpen
            ? "translate-x-0 max-md:translate-y-0"
            : "pointer-events-none md:translate-x-full max-md:translate-y-full"
        )}
        aria-hidden={!isOpen}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-white/10 px-5 py-4 md:px-6 md:py-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {effectiveStep === "checkout" ? (
                <button
                  onClick={() => setStep("cart")}
                  className="flex items-center gap-1.5 rounded-lg p-1 text-neutral-400 transition-colors hover:text-white"
                  aria-label="Volver al carrito"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              ) : (
                <ShoppingBag className="h-5 w-5 shrink-0 text-accent" />
              )}
              <h2 className="truncate text-lg font-bold text-white">
                {effectiveStep === "checkout" ? "Datos del pedido" : "Tu pedido"}
              </h2>
              {effectiveStep === "cart" && count > 0 && (
                <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-bold text-accent">
                  {count}
                </span>
              )}
            </div>

            <button
              onClick={() => {
                closeCart();
                setStep("cart");
              }}
              className="rounded-lg p-1 text-neutral-400 transition-colors hover:text-white"
              aria-label="Cerrar carrito"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col">
          {effectiveStep === "cart" ? (
            <>
              {/* Scrollable items area */}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 md:px-6 md:py-5">
                {items.length === 0 ? (
                  <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-4 text-neutral-500">
                    <ShoppingBag className="h-12 w-12 opacity-20" />
                    <p className="text-center">Tu carrito está vacío</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {items.map((item) => (
                      <CartItem key={item.product.id} item={item} />
                    ))}
                  </div>
                )}
              </div>

              {/* Fixed footer: total + CTA */}
              {items.length > 0 && (
                <div className="shrink-0 border-t border-white/10 bg-[#0b0b0c] px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6 md:py-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex flex-col">
                      <span className="text-xs text-neutral-500">
                        {count} {count === 1 ? "producto" : "productos"}
                      </span>
                      <span className="text-xl font-bold text-accent">
                        ${subtotal.toLocaleString("es-CL")}
                      </span>
                    </div>

                    <button
                      onClick={() => setStep("checkout")}
                      className={cn(
                        "flex items-center gap-2 rounded-xl px-6 py-3.5 text-[15px] font-bold transition-all duration-200",
                        "bg-accent text-background",
                        "shadow-[0_0_15px_rgba(0,255,156,0.3)]",
                        "hover:bg-accent/90 hover:shadow-[0_0_25px_rgba(0,255,156,0.4)]",
                        "active:scale-95"
                      )}
                    >
                      Continuar
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Checkout step — full scroll */
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:px-6 md:py-5">
              <CartSummary tenantId={tenantId} onBack={() => setStep("cart")} />
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
