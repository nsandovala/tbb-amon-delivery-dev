"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import type { CartItem as CartItemType } from "@/types";
import { useCartStore } from "@/lib/store/cart-store";
import { Minus, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface CartItemProps {
  item: CartItemType;
}

export function CartItem({ item }: CartItemProps) {
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);

  const getFallbackImage = (categoryId?: string) => {
    switch (categoryId) {
      case "multiverso-burger":
        return "/images/stubs/burger-real.jpg";
      case "multiverso-mechada":
        return "/images/stubs/mechada-real.jpg";
      case "papas-kaioken":
        return "/images/stubs/fries.png";
      case "bebidas-og":
        return "/images/stubs/drink.png";
      default:
        return "/images/stubs/burger-real.jpg";
    }
  };

  const initialImage = useMemo(
    () => item.product.imageUrl || getFallbackImage(item.product.categoryId),
    [item.product.imageUrl, item.product.categoryId]
  );

  const [imgSrc, setImgSrc] = useState(initialImage);

  const lineTotal = item.product.price * item.quantity;

  return (
    <div className="group relative flex items-start gap-3.5 rounded-2xl border border-white/[0.05] bg-white/[0.02] p-3 transition-all duration-200 hover:border-white/[0.08] hover:bg-white/[0.035]">
      {/* Product Image */}
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-white/[0.06] bg-[#0B0B0B]">
        <Image
          src={imgSrc}
          alt={item.product.name}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          onError={() => setImgSrc(getFallbackImage(item.product.categoryId))}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {/* Top Row: Name & Delete */}
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-white">
            {item.product.name}
          </p>
          <button
            onClick={() => removeItem(item.product.id)}
            className={cn(
              "shrink-0 rounded-lg p-1.5 text-neutral-600 transition-all",
              "hover:bg-red-500/10 hover:text-red-400 active:scale-95"
            )}
            aria-label="Eliminar producto"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Unit Price */}
        <p className="text-[11px] font-medium tracking-wide text-neutral-500 uppercase">
          ${item.product.price.toLocaleString("es-CL")} c/u
        </p>

        {/* Bottom Row: Quantity Controls & Total */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5 rounded-xl border border-white/[0.06] bg-white/[0.03] p-1">
            <button
              onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-all hover:bg-white/10 hover:text-white active:scale-90"
              aria-label="Disminuir cantidad"
            >
              <Minus className="h-3 w-3" />
            </button>

            <span className="min-w-[1.5rem] text-center text-xs font-bold text-white tabular-nums">
              {item.quantity}
            </span>

            <button
              onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-accent/15 bg-accent/10 text-accent transition-all hover:bg-accent hover:text-black active:scale-90"
              aria-label="Aumentar cantidad"
            >
              <Plus className="h-3 w-3 stroke-[3]" />
            </button>
          </div>

          <span className="whitespace-nowrap text-sm font-bold tabular-nums tracking-tight text-accent">
            ${lineTotal.toLocaleString("es-CL")}
          </span>
        </div>
      </div>
    </div>
  );
}
