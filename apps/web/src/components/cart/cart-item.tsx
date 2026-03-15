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

  return (
    <div className="group flex gap-3 rounded-2xl border border-white/6 bg-white/[0.015] p-3 transition-colors hover:border-white/10 hover:bg-white/[0.02]">
      <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-2xl border border-white/8 bg-[#0B0B0B]">
        <Image
          src={imgSrc}
          alt={item.product.name}
          fill
          className="object-cover"
          onError={() => setImgSrc(getFallbackImage(item.product.categoryId))}
        />
      </div>

      <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">
            {item.product.name}
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            ${item.product.price.toLocaleString("es-CL")} c/u
          </p>

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-white transition-colors hover:bg-white/10"
              aria-label="Disminuir cantidad"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>

            <span className="min-w-[1.5rem] text-center text-sm font-bold text-white">
              {item.quantity}
            </span>

            <button
              onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-accent/20 bg-accent/15 text-accent transition-colors hover:bg-accent hover:text-background"
              aria-label="Aumentar cantidad"
            >
              <Plus className="h-3.5 w-3.5 stroke-[3]" />
            </button>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <button
            onClick={() => removeItem(item.product.id)}
            className={cn(
              "rounded-lg p-1.5 text-neutral-500 transition-colors",
              "hover:bg-white/5 hover:text-red-400"
            )}
            aria-label="Eliminar producto"
          >
            <Trash2 className="h-4 w-4" />
          </button>

          <span className="text-sm font-bold text-accent">
            ${(item.product.price * item.quantity).toLocaleString("es-CL")}
          </span>
        </div>
      </div>
    </div>
  );
}
