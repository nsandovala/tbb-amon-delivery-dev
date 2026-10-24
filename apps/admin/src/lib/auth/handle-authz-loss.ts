import type { FirestoreError } from "firebase/firestore";
import { auth } from "../firebase/client";

/**
 * SEC-BASE / H-03: cuando un listener Firestore recibe `permission-denied`
 * significa que las reglas rechazaron la suscripción activa — típicamente
 * porque la membresía del usuario fue revocada o el tenant cambió. En ese
 * instante:
 *
 * 1. Cerramos sesión en Firebase Auth. El guard global reacciona vía
 *    `onAuthStateChanged` y re-renderiza como no autenticado.
 * 2. Redirigimos a `/login`.
 *
 * No usamos `router.replace()` directo porque `window.location.assign` fuerza
 * la liberación de cualquier estado residual del cliente (hooks viejos,
 * suscripciones pendientes de GC). La propiedad "revocación efectiva" aplica
 * desde la próxima request, no durante el ciclo activo del listener.
 */
export function isAuthorizationLost(err: FirestoreError): boolean {
  return err.code === "permission-denied";
}

export async function tearDownAuthorizedSession(): Promise<void> {
  try {
    await auth.signOut();
  } catch {
    // sign-out best-effort; redirect igual.
  }
  if (typeof window !== "undefined") {
    window.location.assign("/login");
  }
}
