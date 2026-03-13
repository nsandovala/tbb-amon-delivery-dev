"use client";

import { useState } from "react";
import { useCartStore } from "@/lib/store/cart-store";
import { createOrder } from "@/lib/firebase/mutations/orders";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface CartSummaryProps {
  tenantId: string;
}

export function CartSummary({ tenantId }: CartSummaryProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const clearCart = useCartStore((s) => s.clearCart);
  const closeCart = useCartStore((s) => s.closeCart);
  const items = useCartStore((s) => s.items);

  // Computar derivados correctamente (reactive tracking)
  const count = items.reduce((acc, i) => acc + i.quantity, 0);
  const subtotal = items.reduce((acc, i) => acc + i.product.price * i.quantity, 0);

  if (count === 0) return null;

  const handleCheckout = async () => {
    setIsSubmitting(true);
    try {
      const orderItems = items.map((i) => ({
        productId: i.product.id,
        qty: i.quantity,
        unitPrice: i.product.price,
      }));

      await createOrder({
        tenantId,
        items: orderItems,
        subtotal,
      });

      clearCart();
      closeCart();
      toast.success("¡Pedido creado exitosamente con estado 'queued'!");
    } catch (err) {
      console.error(err);
      toast.error("Error al crear el pedido. Intenta nuevamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center text-sm text-neutral-400">
        <span>
          {count} {count === 1 ? "producto" : "productos"}
        </span>
        <button
          onClick={clearCart}
          disabled={isSubmitting}
          className="text-red-500 hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Vaciar carrito
        </button>
      </div>

      <div className="flex justify-between items-center">
        <span className="font-semibold text-white text-lg">Subtotal</span>
        <span className="font-bold text-2xl text-accent">
          ${subtotal.toLocaleString("es-CL")}
        </span>
      </div>

      <button
        onClick={handleCheckout}
        disabled={isSubmitting}
        className={cn(
          "w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-[15px] transition-all duration-200",
          isSubmitting 
            ? "bg-white/10 text-white/50 cursor-not-allowed" 
            : "bg-accent hover:bg-accent/90 text-background shadow-[0_0_15px_rgba(0,255,156,0.3)] hover:shadow-[0_0_25px_rgba(0,255,156,0.4)] active:scale-95"
        )}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Procesando pedido...
          </>
        ) : (
          "Pedir ahora (Demo)"
        )}
      </button>
    </div>
  );
}
