import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { PendingOrderNotice } from "@/components/store/pending-order-notice";
import { useCartStore } from "@/lib/store/cart-store";
import type { Product } from "@/types";

/** Componentes reales de la tienda: aviso de pedido + carrito/checkout. */
const product = (id: string, name: string, price: number): Product =>
  ({ id, tenantId: "t1", name, slug: id, description: "", price, tags: [] } as unknown as Product);

const BURGER = product("burger", "Burger Clásica", 6500);
const PAPAS = product("papas", "Papas Rústicas", 2500);

(window as unknown as { __cart: typeof useCartStore }).__cart = useCartStore;

function Harness() {
  const add = useCartStore((s) => s.addItem);
  const open = useCartStore((s) => s.openCart);
  return (
    <>
      <Toaster />
      <nav aria-label="Catálogo de prueba">
        <button onClick={() => add(BURGER)}>Agregar Burger</button>
        <button onClick={() => add(PAPAS)}>Agregar Papas</button>
        <button onClick={open}>Abrir carrito</button>
      </nav>
      <PendingOrderNotice tenantId="t1" />
      <CartDrawer tenantId="t1" />
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
