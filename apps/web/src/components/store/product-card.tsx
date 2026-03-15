"use client";

import { useMemo, useState } from "react";
import type { Product } from "@/types";
import { useCartStore } from "@/lib/store/cart-store";
import { cn } from "@/lib/utils";
import { Heart, Star, Plus, Minus, X } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";

interface ProductCardProps {
  product: Product;
  onHoverCategory?: (id: string | null) => void;
}

export function ProductCard({ product, onHoverCategory }: ProductCardProps) {
  const [showAddonModal, setShowAddonModal] = useState(false);

  const addItem = useCartStore((s) => s.addItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const cartItem = useCartStore((s) =>
    s.items.find((i) => i.product.id === product.id)
  );

  const quantity = cartItem?.quantity || 0;
  const inCart = quantity > 0;

  const likes = useMemo(() => {
    if (product.ui?.likesCount) {
      return product.ui.likesCount >= 1000
        ? `${(product.ui.likesCount / 1000).toFixed(1)}k`
        : String(product.ui.likesCount);
    }
    return `${(Math.random() * (5.0 - 1.0) + 1.0).toFixed(1)}k`;
  }, [product.ui?.likesCount]);

  const rating = useMemo(() => {
    if (product.ui?.rating) return product.ui.rating.toFixed(1);
    return (Math.random() * (5.0 - 4.2) + 4.2).toFixed(1);
  }, [product.ui?.rating]);

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

  const [imgSrc, setImgSrc] = useState(
    product.imageUrl || getFallbackImage(product.categoryId)
  );

  const normalizedName = product.name.toLowerCase();
  const normalizedDescription = product.description?.toLowerCase() || "";
  const normalizedTags = (product.tags || []).map((tag) => tag.toLowerCase());

  const isPromo =
    normalizedTags.includes("promo") ||
    normalizedTags.includes("combo") ||
    normalizedName.includes("promo") ||
    normalizedName.includes("combo") ||
    normalizedName.includes("2x");

  const isBurgerLike =
    normalizedName.includes("burger") ||
    normalizedName.includes("mechada") ||
    normalizedDescription.includes("burger") ||
    normalizedDescription.includes("mechada");

  const handleAddClick = () => {
    if (isPromo) {
      addItem(product);
      toast.success(`${product.name} añadido al carrito`);
      return;
    }

    if (isBurgerLike) {
      setShowAddonModal(true);
      return;
    }

    addItem(product);
    toast.success(`${product.name} añadido al carrito`);
  };

  const confirmAddon = (withFries: boolean) => {
    setShowAddonModal(false);
    addItem(product);
    toast.success(`${product.name} añadido al carrito`);

    if (withFries) {
      const friesMock: Product = {
        id: "papas-kaioken",
        slug: "papas-kaioken",
        name: "Papas Kaioken",
        description: "Papas fritas con extra picante y ciboulette.",
        price: 1500,
        imageUrl: "/images/stubs/fries.png",
        categoryId: "papas-kaioken",
        tenantId: product.tenantId,
        isActive: true,
        createdAt: new Date().toISOString() as any,
        updatedAt: new Date().toISOString() as any,
        tags: [],
      };

      setTimeout(() => {
        addItem(friesMock);
        toast.success("🍟 Papas Kaioken añadidas", {
          style: {
            border: "1px solid #00FF9C",
            color: "#00FF9C",
            background: "#0B0B0B",
          },
        });
      }, 350);
    }
  };

  return (
    <>
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

          <div className="absolute top-4 z-20 flex w-full justify-between px-4">
            <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/50 px-3 py-1.5 backdrop-blur-xl">
              <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
              <span className="text-[11px] font-bold text-white">{rating}</span>
            </div>

            <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/50 px-3 py-1.5 backdrop-blur-xl">
              <Heart className="h-3.5 w-3.5 fill-red-500 text-red-500" />
              <span className="text-[11px] font-bold tracking-tight text-white">
                {likes}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-4 p-6">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-lg font-bold leading-tight tracking-tight text-white transition-colors group-hover:text-accent">
              {product.name}
            </h3>

            {inCart && (
              <span className="shrink-0 rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-accent animate-in zoom-in-75">
                OK
              </span>
            )}
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

      {showAddonModal && (
        <div className="fixed inset-0 z-[100] flex animate-in fade-in duration-300 items-center justify-center bg-black/82 p-4 backdrop-blur-xl">
          <div className="relative flex w-full max-w-md flex-col gap-8 rounded-[2rem] border border-white/10 bg-[#0B0B0B]/94 p-8 shadow-[0_48px_96px_-12px_rgba(0,0,0,1)] backdrop-blur-3xl sm:p-10">
            <button
              onClick={() => setShowAddonModal(false)}
              className="absolute right-5 top-5 p-2 text-neutral-500 transition-colors hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="pt-2 text-center">
              <div className="mb-6 text-6xl filter drop-shadow-[0_0_22px_rgba(0,255,156,0.14)]">
                🍟
              </div>

              <h3 className="mb-3 text-2xl font-bold leading-tight tracking-tight text-white sm:text-3xl">
                ¿La quieres acompañada o huérfana?
              </h3>

              <p className="mx-auto max-w-[28ch] text-sm leading-relaxed text-white/88 sm:text-base">
                Lleva tus{" "}
                <span className="font-bold text-white underline decoration-accent decoration-2 underline-offset-8">
                  Papas Kaioken
                </span>{" "}
                por solo{" "}
                <strong className="ml-1 text-xl text-[#00FF9C]">+$1.500</strong>.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => confirmAddon(true)}
                className={cn(
                  "relative w-full overflow-hidden rounded-2xl py-3 sm:py-3.5",
                  "text-base sm:text-lg font-black tracking-[0.04em] text-black",
                  "border border-[#7DFFD8]/28",
                  "bg-[linear-gradient(180deg,#19FFAE_0%,#00F59A_100%)]",
                  "shadow-[0_16px_34px_rgba(0,255,156,0.16),inset_0_1px_0_rgba(255,255,255,0.28)]",
                  "transition-all duration-300 hover:scale-[1.01] hover:shadow-[0_18px_38px_rgba(0,255,156,0.18),inset_0_1px_0_rgba(255,255,255,0.35)] active:scale-[0.985]"
                )}
              >
                <span className="pointer-events-none absolute inset-x-6 top-0 h-px bg-white/55 opacity-70" />
                <span className="relative z-10">AGREGAR PAPAS</span>
              </button>

              <button
                onClick={() => confirmAddon(false)}
                className={cn(
                  "relative w-full overflow-hidden rounded-2xl py-3 sm:py-3.5",
                  "text-sm sm:text-base font-bold text-white transition-all duration-300",
                  "border border-white/10 backdrop-blur-md",
                  "bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))]",
                  "shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]",
                  "hover:border-white/16 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))]"
                )}
              >
                <span className="pointer-events-none absolute inset-[1px] rounded-[15px] bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.008))]" />
                <span className="relative z-10">Llevarla huérfana</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
