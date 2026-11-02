/**
 * DEPLOY-READY-01 (A1) — configuración pública del navegador en un solo lugar.
 *
 * `next.config.ts` define `AMON_BUILD_TARGET` en todos los builds ("production"
 * solo vía `tools/build-hosting.mjs`) y Next lo reemplaza por un literal. En un
 * build productivo las ramas locales de abajo quedan muertas y desaparecen del
 * bundle: sin emuladores, sin `127.0.0.1` y sin `minerp-sentinel` de respaldo.
 * Las variables obligatorias las valida `tools/build-hosting.mjs` antes de compilar.
 *
 * En desarrollo y en los builds normales el comportamiento no cambia.
 */
const PRODUCTION_BUILD = process.env.AMON_BUILD_TARGET === "production";

const HAS_EXPLICIT_FUNCTIONS_BASE = Boolean(process.env.NEXT_PUBLIC_FUNCTIONS_BASE_URL);

/** Firestore del storefront contra el emulador. */
export const USE_FIRESTORE_EMULATOR =
  !PRODUCTION_BUILD && process.env.NEXT_PUBLIC_USE_EMULATOR === "true";

/** Llamadas a Functions por el proxy de `next dev` (también por defecto en desarrollo). */
const USE_FUNCTIONS_PROXY =
  !PRODUCTION_BUILD &&
  (process.env.NEXT_PUBLIC_USE_EMULATOR === "true" ||
    (process.env.NODE_ENV === "development" && !HAS_EXPLICIT_FUNCTIONS_BASE));

// HOSTING-SPIKE-01: una URL explícita de Functions tiene prioridad sobre el
// proxy `/api/functions`, que solo existe en `next dev` (rewrite). En un build
// estático no hay proxy: el navegador llama directo a Functions.
export const FUNCTIONS_BASE = PRODUCTION_BUILD
  ? process.env.NEXT_PUBLIC_FUNCTIONS_BASE_URL ?? ""
  : process.env.NEXT_PUBLIC_FUNCTIONS_BASE_URL ??
    (USE_FUNCTIONS_PROXY ? "/api/functions" : "http://127.0.0.1:5001/minerp-sentinel/us-central1");

export const FIREBASE_CONFIG = PRODUCTION_BUILD
  ? {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    }
  : {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "dev",
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "dev",
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "minerp-sentinel",
    };

// El valor local se condiciona a `PRODUCTION_BUILD` directamente (no a
// `USE_FIRESTORE_EMULATOR`, que es un binding exportado y el minificador no lo pliega).
export const FIRESTORE_EMULATOR_HOST = PRODUCTION_BUILD
  ? ""
  : process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
