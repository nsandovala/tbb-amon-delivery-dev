import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { signInWithEmailAndPassword } from "firebase/auth";
import PosPage from "@/app/pos/page";
import { AdminGuard } from "@/components/admin-guard";
import { TenantProvider } from "@/components/tenant-provider";
import { auth } from "@/lib/firebase/client";

/**
 * Página POS real dentro del `TenantProvider` y el `AdminGuard` reales: sesión
 * en el emulador de Auth, membresías vía `listMyMemberships`, catálogo y
 * ventas en el emulador de Firestore. "Salir del POS" desmonta la página como
 * una navegación del cliente (la petición en vuelo sigue viva).
 */
(window as unknown as { __signIn: (email: string, password: string) => Promise<unknown> }).__signIn = (email, password) =>
  signInWithEmailAndPassword(auth, email, password);

function Harness() {
  const [mounted, setMounted] = useState(true);
  return (
    <>
      <nav aria-label="Navegación" className="flex gap-2 p-2">
        <button onClick={() => setMounted(false)}>Salir del POS</button>
        <button onClick={() => setMounted(true)}>Volver al POS</button>
      </nav>
      <AdminGuard>{mounted ? <PosPage /> : <p>Otra pantalla</p>}</AdminGuard>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TenantProvider>
      <Harness />
    </TenantProvider>
  </StrictMode>
);
