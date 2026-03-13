"use client";

import { useCartStore } from "@/lib/store/cart-store";
import { ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";

interface StoreHeaderProps {
  tenantName: string;
}

export function StoreHeader({ tenantName }: StoreHeaderProps) {
  const toggleCart = useCartStore((s) => s.toggleCart);
  
  // Custom selector for performance
  const count = useCartStore((s) => 
    s.items.reduce((acc, i) => acc + i.quantity, 0)
  );

  return (
    <header className="sticky top-0 z-50 w-full backdrop-blur-md bg-background/80 border-b border-white/5 py-4 px-6 md:px-12 flex items-center justify-between transition-all">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold tracking-tight text-white">{tenantName}</h1>
      </div>

      <button
        onClick={toggleCart}
        className={cn(
          "relative flex items-center gap-2 px-4 py-2 rounded-xl",
          "border border-white/10 bg-white/5",
          "text-white transition-all duration-300 ease-in-out",
          "hover:border-accent hover:bg-accent/10 hover:shadow-[0_0_15px_rgba(0,255,156,0.3)]"
        )}
        aria-label="Abrir carrito"
      >
        <ShoppingCart className="w-5 h-5" />
        {count > 0 && (
          <span className="absolute -top-2 -right-2 min-w-[20px] h-[20px] flex items-center justify-center rounded-full bg-accent text-background text-[11px] font-bold px-1.5 animate-in zoom-in">
            {count}
          </span>
        )}
      </button>
    </header>
  );
}
