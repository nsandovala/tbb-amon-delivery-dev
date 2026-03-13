"use client";

import { useState } from "react";
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

  const getCategoryIcon = (categoryId?: string) => {
    switch (categoryId) {
      case "multiverso-burger": return "🍔";
      case "multiverso-mechada": return "🥩";
      case "papas-kaioken": return "🍟";
      case "bebidas-og": return "🥤";
      case "aumenta-tu-ki": return "🔥";
      default: return "🍔";
    }
  };

  // Mock data for production-grade look as requested
  const likes = product.ui?.likesCount 
    ? (product.ui.likesCount >= 1000 ? (product.ui.likesCount / 1000).toFixed(1) + "k" : product.ui.likesCount)
    : (Math.random() * (5.0 - 1.0) + 1.0).toFixed(1) + "k";
  const rating = product.ui?.rating?.toFixed(1) || (Math.random() * (5.0 - 4.2) + 4.2).toFixed(1);

  const getFallbackImage = (categoryId?: string) => {
    switch (categoryId) {
      case "multiverso-burger": return "/images/stubs/burger-real.jpg";
      case "multiverso-mechada": return "/images/stubs/mechada-real.jpg";
      case "papas-kaioken": return "/images/stubs/fries.png";
      case "bebidas-og": return "/images/stubs/drink.png";
      default: return "/images/stubs/burger-real.jpg";
    }
  };

  const [imgSrc, setImgSrc] = useState(product.imageUrl || getFallbackImage(product.categoryId));

  const handleAddClick = () => {
    const isBurger = product.name.toLowerCase().includes("burger") || product.name.toLowerCase().includes("mechada") || product.description?.toLowerCase().includes("burger");
    
    if (isBurger) {
      setShowAddonModal(true);
    } else {
      addItem(product);
      toast.success(`${product.name} añadido al carrito`);
    }
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
        toast.success(`🍟 Papas Kaioken añadidas`, {
          style: { border: "1px solid #00FF9C", color: "#00FF9C" },
        });
      }, 500);
    }
  };

  return (
    <>
      <div
        onMouseEnter={() => onHoverCategory?.(product.categoryId ?? null)}
        onMouseLeave={() => onHoverCategory?.(null)}
        className={cn(
          "group relative flex flex-col rounded-3xl bg-[#141414] border transition-all duration-300 ease-out h-full overflow-hidden z-10",
          inCart 
            ? "border-accent/30 shadow-[0_0_20px_rgba(0,255,156,0.05)] bg-accent/[0.02]" 
            : "border-white/5 hover:border-accent/20 hover:shadow-2xl hover:scale-[1.02]"
        )}
      >
        {/* Image Container 1:1 */}
        <div className="relative w-full aspect-square bg-[#0B0B0B] flex items-center justify-center overflow-hidden border-b border-white/5 shrink-0">
          <Image 
            src={imgSrc} 
            alt={product.name} 
            fill
            className="object-cover transition-transform duration-700 group-hover:scale-105"
            onError={() => setImgSrc(getFallbackImage(product.categoryId))}
          />
          
          <div className="absolute top-4 w-full px-4 flex justify-between z-20">
            <div className="flex bg-black/50 backdrop-blur-xl rounded-full px-3 py-1.5 items-center gap-1.5 border border-white/10">
              <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
              <span className="text-[11px] font-bold text-white">{rating}</span>
            </div>
            <div className="flex bg-black/50 backdrop-blur-xl rounded-full px-3 py-1.5 items-center gap-1.5 border border-white/10">
              <Heart className="w-3.5 h-3.5 fill-red-500 text-red-500" />
              <span className="text-[11px] font-bold text-white tracking-tight">{likes}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col flex-1 p-6 gap-4">
          <div className="flex justify-between items-start gap-3">
            <h3 className="text-lg font-bold text-white leading-tight tracking-tight group-hover:text-accent transition-colors">
              {product.name}
            </h3>
            {inCart && (
              <span className="shrink-0 text-[10px] bg-accent/10 text-accent border border-accent/20 px-2.5 py-1 rounded-full font-bold uppercase tracking-widest animate-in zoom-in-75">
                OK
              </span>
            )}
          </div>

          <p className="text-xs text-neutral-400 flex-1 line-clamp-3 leading-relaxed opacity-60 group-hover:opacity-100 transition-opacity min-h-[3.6rem]">
            {product.description}
          </p>

          <div className="flex items-center justify-between mt-auto pt-5 border-t border-white/5 relative z-10">
            <span className="font-bold text-2xl text-white tracking-tight">
              ${product.price.toLocaleString("es-CL")}
            </span>

            {inCart ? (
              <div className="flex items-center gap-3 bg-white/5 rounded-2xl p-1 border border-white/10 relative z-20">
                <button
                  onClick={(e) => { e.stopPropagation(); updateQuantity(product.id, quantity - 1); }}
                  className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-xl text-white transition-colors cursor-pointer"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-4 text-center font-bold text-white text-base">
                  {quantity}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); updateQuantity(product.id, quantity + 1); }}
                  className="w-10 h-10 flex items-center justify-center bg-accent/80 hover:bg-accent rounded-xl text-background transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                </button>
              </div>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); handleAddClick(); }}
                className="relative z-30 bg-accent/5 border border-accent/20 hover:bg-accent hover:text-background text-accent px-6 py-3 rounded-xl font-bold text-xs transition-all uppercase tracking-[0.15em] active:scale-95 shadow-sm cursor-pointer pointer-events-auto"
              >
                Agregar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Contextual Add-On Modal: Mate Glass Style for Readability */}
      {showAddonModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-in fade-in duration-400">
          <div className="relative w-full max-w-md bg-[#0B0B0B]/98 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] shadow-[0_48px_96px_-12px_rgba(0,0,0,1)] p-12 flex flex-col gap-10 animate-in zoom-in-95 duration-400">
            <button 
              onClick={() => setShowAddonModal(false)}
              className="absolute top-8 right-8 text-neutral-500 hover:text-white transition-colors p-2"
            >
              <X className="w-6 h-6" />
            </button>
            
            <div className="text-center pt-2">
              <div className="text-7xl mb-10 filter drop-shadow-[0_0_30px_rgba(0,255,156,0.3)]">🍟</div>
              <h3 className="text-3xl font-bold text-white mb-4 tracking-tight leading-tight">
                ¿La quieres acompañada o huérfana?
              </h3>
              <p className="text-base text-neutral-400 leading-relaxed px-8">
                Lleva tus <span className="text-white font-bold decoration-accent underline-offset-8 underline decoration-2">Papas Kaioken</span> por solo <strong className="text-[#00FF9C] text-xl ml-1">+$1.500</strong>.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <button
                onClick={() => confirmAddon(true)}
                className="w-full bg-[#00FF9C] text-black text-lg font-black rounded-2xl py-5 shadow-2xl transition-all hover:shadow-[#00FF9C]/20 hover:scale-[1.02] active:scale-95"
              >
                AGREGAR PAPAS
              </button>
              <button
                onClick={() => confirmAddon(false)}
                className="w-full bg-white/5 border border-white/10 text-white text-base font-bold rounded-2xl py-5 hover:bg-white/10 hover:text-white transition-all"
              >
                Llevarla huérfana
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
