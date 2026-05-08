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

function getFallbackImage(categoryId?: string) {
  const normalizedCategoryId = categoryId?.toLowerCase() ?? "";

  if (
    normalizedCategoryId.includes("papas") ||
    normalizedCategoryId.includes("fries")
  ) {
    return "/images/stubs/fries.png";
  }

  switch (categoryId) {
    case "multiverso-burger":
      return "/images/stubs/burger-real.jpg";
    case "multiverso-mechada":
      return "/images/stubs/mechada-real.jpg";
    case "bebidas-og":
      return "/images/stubs/drink.png";
    default:
      return "/images/stubs/burger-real.jpg";
  }
}

export function CartItem({ item }: CartItemProps) {
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);

  const initialImage = useMemo(
    () => item.product.imageUrl || getFallbackImage(item.product.categoryId),
    [item.product.imageUrl, item.product.categoryId]
  );

  const [imgSrc, setImgSrc] = useState(initialImage);

  return (
    <div className="group flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.02] p-2.5 transition-colors hover:border-white/12 hover:bg-white/[0.03]">
      {/* Thumbnail */}
      <div className="relative h-[56px] w-[56px] shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#0B0B0B]">
        <Image
          src={imgSrc}
          alt={item.product.name}
          fill
          className="object-cover"
          onError={() => setImgSrc(getFallbackImage(item.product.categoryId))}
        />
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-sm font-semibold leading-5 text-white">
          {item.product.name}
        </p>
        <p className="mt-0.5 text-xs text-neutral-400">
          ${item.product.price.toLocaleString("es-CL")} c/u
        </p>
      </div>

      {/* Quantity + price */}
      <div className="flex shrink-0 items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white transition-colors hover:bg-white/10"
            aria-label="Disminuir cantidad"
          >
            <Minus className="h-3 w-3" />
          </button>

          <span className="min-w-[1.25rem] text-center text-sm font-bold text-white">
            {item.quantity}
          </span>

          <button
            onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-accent/20 bg-accent/15 text-accent transition-colors hover:bg-accent hover:text-background"
            aria-label="Aumentar cantidad"
          >
            <Plus className="h-3 w-3 stroke-[3]" />
          </button>
        </div>

        {/* Line total + delete */}
        <div className="flex flex-col items-end gap-0.5 pl-1">
          <span className="whitespace-nowrap text-sm font-bold text-accent">
            ${(item.product.price * item.quantity).toLocaleString("es-CL")}
          </span>
          <button
            onClick={() => removeItem(item.product.id)}
            className={cn(
              "rounded p-0.5 text-neutral-600 transition-colors",
              "hover:text-red-400"
            )}
            aria-label="Eliminar producto"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
