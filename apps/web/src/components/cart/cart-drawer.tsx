"use client";

import { useCartStore } from "@/lib/store/cart-store";
import { CartItem } from "./cart-item";
import { CartSummary } from "./cart-summary";
import { X, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";

interface CartDrawerProps {
  tenantId: string;
}

export function CartDrawer({ tenantId }: CartDrawerProps) {
  const isOpen = useCartStore((s) => s.isOpen);
  const closeCart = useCartStore((s) => s.closeCart);
  const items = useCartStore((s) => s.items);

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
          "max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:h-[85svh] max-md:rounded-t-3xl max-md:border-t",
          isOpen
            ? "translate-x-0 max-md:translate-y-0"
            : "pointer-events-none md:translate-x-full max-md:translate-y-full"
        )}
        aria-hidden={!isOpen}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-white/10 px-5 py-5 md:px-6 md:py-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <ShoppingBag className="h-5 w-5 shrink-0 text-accent" />
              <h2 className="truncate text-xl font-bold text-white">
                Tu pedido
              </h2>
            </div>

            <button
              onClick={closeCart}
              className="rounded-lg p-1 text-neutral-400 transition-colors hover:text-white"
              aria-label="Cerrar carrito"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Items */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-6 md:py-6">
            {items.length === 0 ? (
              <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-4 text-neutral-500">
                <ShoppingBag className="h-12 w-12 opacity-20" />
                <p className="text-center">Tu carrito está vacío</p>
              </div>
            ) : (
              <div className="space-y-4">
                {items.map((item) => (
                  <CartItem key={item.product.id} item={item} />
                ))}
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="shrink-0 border-t border-white/10 bg-[#0b0b0c] px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:px-6 md:py-6">
            <CartSummary tenantId={tenantId} />
          </div>
        </div>
      </aside>
    </>
  );
}
