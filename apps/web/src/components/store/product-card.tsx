"use client";

import { useMemo, useState } from "react";
import type { Product } from "@/types";
import { useCartStore } from "@/lib/store/cart-store";
import { cn } from "@/lib/utils";
import { Heart, Star, Plus, Minus } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";

interface ProductCardProps {
  product: Product;
  onHoverCategory?: (id: string | null) => void;
}

function getFallbackImage(categoryId?: string) {
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
}

function formatLikes(value?: number) {
  if (typeof value !== "number") return null;
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

export function ProductCard({ product, onHoverCategory }: ProductCardProps) {
  const addItem = useCartStore((s) => s.addItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const cartItem = useCartStore((s) =>
    s.items.find((i) => i.product.id === product.id)
  );

  const quantity = cartItem?.quantity || 0;
  const inCart = quantity > 0;
  const likes = useMemo(() => formatLikes(product.ui?.likesCount), [product.ui?.likesCount]);
  const rating =
    typeof product.ui?.rating === "number" ? product.ui.rating.toFixed(1) : null;
  const [imgSrc, setImgSrc] = useState(
    product.imageUrl || getFallbackImage(product.categoryId)
  );

  const handleAddClick = () => {
    addItem(product);
    toast.success(`${product.name} añadido al carrito`);
  };

  return (
    <div
      onMouseEnter={() => onHoverCategory?.(product.categoryId ?? null)}
      onMouseLeave={() => onHoverCategory?.(null)}
      className={cn(
        "group relative z-10 flex h-full flex-col overflow-hidden rounded-3xl border bg-[#141414] transition-all duration-300 ease-out",
        inCart
          ? "border-accent/30 bg-accent/[0.02] shadow-[0_0_20px_rgba(0,255,156,0.05)]"
          : "border-white/5 hover:scale-[1.02] hover:border-accent/20 hover:shadow-2xl"
      )}
    >
      <div className="relative aspect-square w-full shrink-0 overflow-hidden border-b border-white/5 bg-[#0B0B0B]">
        <Image
          src={imgSrc}
          alt={product.name}
          fill
          className="object-cover transition-transform duration-700 group-hover:scale-105"
          onError={() => setImgSrc(getFallbackImage(product.categoryId))}
        />

        {(rating || likes) ? (
          <div className="absolute top-4 z-20 flex w-full justify-between px-4">
            {rating ? (
              <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/50 px-3 py-1.5 backdrop-blur-xl">
                <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                <span className="text-[11px] font-bold text-white">{rating}</span>
              </div>
            ) : (
              <div />
            )}

            {likes ? (
              <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/50 px-3 py-1.5 backdrop-blur-xl">
                <Heart className="h-3.5 w-3.5 fill-red-500 text-red-500" />
                <span className="text-[11px] font-bold tracking-tight text-white">
                  {likes}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-bold leading-tight tracking-tight text-white transition-colors group-hover:text-accent">
            {product.name}
          </h3>

          {inCart ? (
            <span className="shrink-0 rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-accent animate-in zoom-in-75">
              OK
            </span>
          ) : null}
        </div>

        <p className="min-h-[3.6rem] flex-1 line-clamp-3 text-xs leading-relaxed text-neutral-400 opacity-60 transition-opacity group-hover:opacity-100">
          {product.description}
        </p>

        <div className="relative z-10 mt-auto flex items-center justify-between border-t border-white/5 pt-5">
          <span className="text-2xl font-bold tracking-tight text-white">
            ${product.price.toLocaleString("es-CL")}
          </span>

          {inCart ? (
            <div className="relative z-20 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-1 backdrop-blur-md">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updateQuantity(product.id, quantity - 1);
                }}
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-white transition-colors hover:bg-white/10"
              >
                <Minus className="h-4 w-4" />
              </button>

              <span className="w-4 text-center text-base font-bold text-white">
                {quantity}
              </span>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updateQuantity(product.id, quantity + 1);
                }}
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-accent/85 text-background transition-colors hover:bg-accent"
              >
                <Plus className="h-4 w-4 stroke-[3]" />
              </button>
            </div>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleAddClick();
              }}
              className={cn(
                "relative z-30 cursor-pointer overflow-hidden rounded-2xl border px-5 py-3",
                "text-xs font-bold uppercase tracking-[0.15em] transition-all duration-300",
                "backdrop-blur-md active:scale-95 pointer-events-auto",
                "border-white/10 text-white",
                "bg-[linear-gradient(180deg,rgba(255,255,255,0.042),rgba(255,255,255,0.016))]",
                "shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
                "hover:border-[#00FF9C]/24 hover:text-[#D8FFF1]",
                "hover:shadow-[0_0_0_1px_rgba(0,255,156,0.06),0_0_14px_rgba(0,255,156,0.07),inset_0_1px_0_rgba(255,255,255,0.06)]"
              )}
            >
              <span className="pointer-events-none absolute inset-[1px] rounded-[15px] bg-[linear-gradient(180deg,rgba(255,255,255,0.024),rgba(255,255,255,0.008))]" />
              <span className="relative z-10">Agregar</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
