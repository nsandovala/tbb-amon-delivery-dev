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
          "fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none hidden"
        )}
        onClick={closeCart}
      />

      {/* Drawer */}
      <div
        className={cn(
          "fixed z-[70] flex flex-col bg-card border-white/10 transition-transform duration-300 ease-in-out",
          "md:right-0 md:top-0 md:bottom-0 md:w-[400px] md:border-l",
          "max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:h-[85vh] max-md:rounded-t-3xl max-md:border-t",
          isOpen 
            ? "translate-x-0 max-md:translate-y-0" 
            : "md:translate-x-full max-md:translate-y-full pointer-events-none hidden"
        )}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-5 md:p-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <ShoppingBag className="w-5 h-5 text-accent" />
            <h2 className="text-xl font-bold text-white m-0">Tu pedido</h2>
          </div>
          <button
            onClick={closeCart}
            className="text-neutral-400 hover:text-white transition-colors p-1"
            aria-label="Cerrar carrito"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-neutral-500 gap-4">
              <ShoppingBag className="w-12 h-12 opacity-20" />
              <p className="text-center">Tu carrito está vacío</p>
            </div>
          ) : (
            items.map((item) => (
              <CartItem key={item.product.id} item={item} />
            ))
          )}
        </div>

        {/* Summary */}
        <div className="p-5 md:p-6 bg-card border-t border-white/5">
          <CartSummary tenantId={tenantId} />
        </div>
      </div>
    </>
  );
}
