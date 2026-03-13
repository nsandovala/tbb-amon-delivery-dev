import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getFirestore,
  connectFirestoreEmulator,
  type Firestore,
} from "firebase/firestore";

/* ──────────────────────────────────────────────
 * Firebase Client SDK — Best practices Vercel + Firebase
 *
 * 1. Lazy init: no side-effects al importar el módulo
 * 2. Singleton: getApps() evita re-init en HMR
 * 3. Emulator guard: globalThis flag evita doble-connect
 * 4. Compatible con Server Components y Client Components
 * ────────────────────────────────────────────── */

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "dev",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "dev",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "minerp-sentinel",
};

// ── Singleton app ──────────────────────────────
function getApp(): FirebaseApp {
  return getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
}

// ── Emulator guard via globalThis (sobrevive HMR) ──
const g = globalThis as unknown as { __FIRESTORE_EMULATOR__?: boolean };

function getDb(): Firestore {
  const firestore = getFirestore(getApp());

  if (
    process.env.NEXT_PUBLIC_USE_EMULATOR === "true" &&
    !g.__FIRESTORE_EMULATOR__
  ) {
    connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
    g.__FIRESTORE_EMULATOR__ = true;
  }

  return firestore;
}

// ── Export singleton ────────────────────────────
export const db = getDb();