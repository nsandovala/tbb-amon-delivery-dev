import { useState } from "react";
import { createRoot } from "react-dom/client";
import PosPage from "@/app/pos/page";

/**
 * Página POS real. "Salir del POS" desmonta la página como lo haría una
 * navegación del lado del cliente (la petición en vuelo sigue viva).
 */
(window as unknown as { __products: unknown[] }).__products = [
  { id: "burger", name: "Burger Clásica", price: 6500, isActive: true, categoryId: "burgers" },
  { id: "papas", name: "Papas Rústicas", price: 2500, isActive: true, categoryId: "papas" },
];

function Harness() {
  const [mounted, setMounted] = useState(true);
  return (
    <>
      <nav aria-label="Navegación de prueba">
        <button onClick={() => setMounted(false)}>Salir del POS</button>
        <button onClick={() => setMounted(true)}>Volver al POS</button>
      </nav>
      {mounted ? <PosPage /> : <p>Otra pantalla</p>}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
