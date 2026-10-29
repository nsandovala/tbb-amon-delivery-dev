import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { signInWithEmailAndPassword } from "firebase/auth";
import { TransferPaymentControl } from "@/components/payments/transfer-payment-control";
import { auth } from "@/lib/firebase/client";

/**
 * PR #88 (P2-01) — `TransferPaymentControl` REAL en el mismo lugar del árbol
 * para dos pedidos, como el detalle de `/pedidos`: el llamador no le pone
 * `key`, igual que la página. Sesión en el emulador de Auth; confirmar,
 * revertir e historial van a Functions por la capa de transporte.
 * `window.__harness = { tenantId, orders: [A, B] }` (documentos reales).
 */
type HarnessOrder = Parameters<typeof TransferPaymentControl>[0]["order"];
const config = (window as unknown as { __harness: { tenantId: string; orders: HarnessOrder[] } }).__harness;

(window as unknown as { __signIn: (email: string, password: string) => Promise<unknown> }).__signIn = (email, password) =>
  signInWithEmailAndPassword(auth, email, password);

function Harness() {
  const [selected, setSelected] = useState(0);
  const order = config.orders[selected];
  return (
    <main className="p-4">
      <nav aria-label="Pedidos" className="flex gap-2">
        {config.orders.map((item, index) => (
          <button key={item.id} type="button" aria-pressed={index === selected} onClick={() => setSelected(index)}>
            Pedido {item.id}
          </button>
        ))}
      </nav>
      <section aria-label="Detalle del pedido">
        <p>Seleccionado: {order.id}</p>
        <TransferPaymentControl tenantId={config.tenantId} order={order} />
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Harness />
  </StrictMode>
);
