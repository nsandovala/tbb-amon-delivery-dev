"use client";

import type { CartItem as CartItemType } from "@/types";
import { useCartStore } from "@/lib/store/cart-store";
import { Minus, Plus, Trash2 } from "lucide-react";

interface CartItemProps {
  item: CartItemType;
}

export function CartItem({ item }: CartItemProps) {
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);

  return (
    <div className="flex items-center gap-4 py-4 border-b border-white/5 last:border-0 group">
      {/* Remove */}
      <button
        onClick={() => removeItem(item.product.id)}
        className="text-neutral-500 hover:text-red-500 transition-colors p-1"
        aria-label="Eliminar producto"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-white truncate">
          {item.product.name}
        </p>
        <p className="text-xs text-neutral-400 mt-0.5">
          ${item.product.price.toLocaleString("es-CL")} c/u
        </p>
      </div>

      <div className="flex flex-col items-end gap-2">
        {/* Line total */}
        <span className="font-bold text-accent text-sm">
          ${(item.product.price * item.quantity).toLocaleString("es-CL")}
        </span>

        {/* Qty controls */}
        <div className="flex items-center gap-3 bg-black/40 rounded-lg p-1 border border-white/10">
          <button
            className="w-6 h-6 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded text-white transition-colors"
            onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
            aria-label="Disminuir cantidad"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="min-w-[1.25rem] text-center font-bold text-sm text-white">
            {item.quantity}
          </span>
          <button
            className="w-6 h-6 flex items-center justify-center bg-accent/20 hover:bg-accent hover:text-background text-accent rounded transition-colors"
            onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
            aria-label="Aumentar cantidad"
          >
            <Plus className="w-3 h-3 stroke-[3]" />
          </button>
        </div>
      </div>
    </div>
  );
}
