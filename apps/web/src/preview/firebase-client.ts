import type { Firestore } from "firebase/firestore";

/**
 * TBB-TABLET-PREVIEW-01 — reemplaza `src/lib/firebase/client.ts` en la vista previa.
 * Ningún módulo de la vista previa debería importarlo; si alguno lo hace, la
 * página falla a la vista en lugar de conectarse a Firebase.
 */
throw new Error("[preview] Firebase está deshabilitado en la vista previa.");

export const db = undefined as unknown as Firestore;
