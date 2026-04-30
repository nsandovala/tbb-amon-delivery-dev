"use client";

import { useCartStore } from "@/lib/store/cart-store";
import { CartItem } from "./cart-item";
import { CartCheckoutForm } from "./cart-checkout-form";
import { X, ShoppingBag, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface CartDrawerProps {
  tenantId: string;
}

export function CartDrawer({ tenantId }: CartDrawerProps) {
  const isOpen = useCartStore((s) => s.isOpen);
  const closeCart = useCartStore((s) => s.closeCart);
  const items = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clearCart);

  const count = items.reduce((acc, i) => acc + i.quantity, 0);
  const hasItems = items.length > 0;

  return (
    <>
      {/* Overlay */}
      <div
        className={cn(
          "fixed inset-0 z-[60] bg-black/80 backdrop-blur-md transition-opacity duration-300",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={closeCart}
      />

      {/* Drawer */}
      <aside
        className={cn(
          "fixed z-[70] flex h-full flex-col border-white/10 bg-[#0b0b0c]/95 shadow-[0_0_60px_rgba(0,0,0,0.6)] backdrop-blur-2xl transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          "md:right-0 md:top-0 md:bottom-0 md:w-[460px] md:border-l",
          "max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:h-[88dvh] max-md:rounded-t-[2rem] max-md:border-t",
          isOpen
            ? "translate-x-0 max-md:translate-y-0"
            : "pointer-events-none md:translate-x-full max-md:translate-y-full"
        )}
        aria-hidden={!isOpen}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-white/[0.06] px-5 py-4 md:px-7 md:py-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03]">
                <ShoppingBag className="h-4 w-4 text-accent" />
                {count > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-black">
                    {count}
                  </span>
                )}
              </div>
              <div className="flex flex-col">
                <h2 className="truncate text-lg font-bold tracking-tight text-white">
                  Tu pedido
                </h2>
                {count > 0 && (
                  <span className="text-[11px] font-medium text-neutral-500">
                    {count} {count === 1 ? "producto" : "productos"}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {hasItems && (
                <button
                  onClick={clearCart}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-neutral-500 transition-all hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
                  aria-label="Vaciar carrito"
                  title="Vaciar carrito"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={closeCart}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-neutral-400 transition-all hover:border-white/20 hover:text-white hover:bg-white/[0.06]"
                aria-label="Cerrar carrito"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Body: scrollable content area */}
        <div className="flex min-h-0 flex-1 flex-col">
          {hasItems ? (
            <>
              {/* Scrollable area: items + checkout form */}
              <div className="flex-1 overflow-y-auto px-5 py-4 md:px-7 md:py-5">
                {/* Cart Items List */}
                <div className="flex flex-col gap-3">
                  {items.map((item) => (
                    <CartItem key={item.product.id} item={item} />
                  ))}
                </div>

                {/* Divider */}
                <div className="my-5 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

                {/* Checkout Form */}
                <CartCheckoutForm tenantId={tenantId} />
              </div>
            </>
          ) : (
            /* Empty state */
            <div className="flex flex-1 flex-col items-center justify-center gap-5 px-5 text-neutral-500">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/5 bg-white/[0.02]">
                <ShoppingBag className="h-7 w-7 text-neutral-600" />
              </div>
              <div className="flex flex-col items-center gap-1">
                <p className="text-center text-sm font-semibold text-neutral-300">
                  Tu carrito está vacío
                </p>
                <p className="max-w-[24ch] text-center text-xs leading-relaxed text-neutral-600">
                  Explora el menú y añade productos a tu pedido.
                </p>
              </div>
              <button
                onClick={closeCart}
                className="mt-1 rounded-xl border border-white/10 bg-white/[0.04] px-5 py-2.5 text-xs font-semibold text-white transition-all hover:border-accent/20 hover:bg-accent/10 hover:text-accent"
              >
                Seguir comprando
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
