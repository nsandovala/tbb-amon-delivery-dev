import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { PendingOrderNotice } from "@/components/store/pending-order-notice";
import { useCartStore } from "@/lib/store/cart-store";
import type { Product } from "@/types";

/**
 * Tienda real sin la página de catálogo: aviso de pedido + cajón del carrito
 * (`CartDrawer` → `CartSummary`) con el store real. Los botones "Agregar" solo
 * reemplazan las tarjetas del catálogo: agregan productos que existen en el
 * tenant del emulador; precios y validación los decide el backend real.
 */
type HarnessConfig = { tenantId: string; products: { id: string; name: string; price: number }[] };
const config = (window as unknown as { __harness: HarnessConfig }).__harness;

(window as unknown as { __cart: typeof useCartStore }).__cart = useCartStore;

function Harness() {
  const add = useCartStore((s) => s.addItem);
  const open = useCartStore((s) => s.openCart);
  return (
    <div className="min-h-screen bg-[#0B0B0B] p-4 text-white">
      <nav aria-label="Catálogo" className="flex flex-wrap gap-2">
        {config.products.map((p) => (
          <button
            key={p.id}
            className="rounded-lg border border-white/20 px-3 py-2"
            onClick={() =>
              add({ id: p.id, tenantId: config.tenantId, name: p.name, slug: p.id, description: "", price: p.price, tags: [] } as unknown as Product)
            }
          >
            Agregar {p.name}
          </button>
        ))}
        <button className="rounded-lg border border-white/20 px-3 py-2" onClick={open}>
          Abrir carrito
        </button>
      </nav>
      <PendingOrderNotice tenantId={config.tenantId} />
      <CartDrawer tenantId={config.tenantId} />
      <Toaster theme="dark" position="bottom-right" />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Harness />
  </StrictMode>
);
