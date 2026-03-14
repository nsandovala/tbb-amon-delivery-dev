import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getFirestore,
  connectFirestoreEmulator,
  type Firestore,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "dev",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "dev",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "minerp-sentinel",
};

const globalForFirebase = globalThis as typeof globalThis & {
  __firebase_app__?: FirebaseApp;
  __firestore_db__?: Firestore;
  __firestore_emulator_connected__?: boolean;
};

function getFirebaseAppInstance(): FirebaseApp {
  if (globalForFirebase.__firebase_app__) {
    return globalForFirebase.__firebase_app__;
  }

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  globalForFirebase.__firebase_app__ = app;
  return app;
}

function getFirestoreInstance(): Firestore {
  if (globalForFirebase.__firestore_db__) {
    return globalForFirebase.__firestore_db__;
  }

  const firestore = getFirestore(getFirebaseAppInstance());

  const useEmulator = process.env.NEXT_PUBLIC_USE_EMULATOR === "true";
  const emulatorHost =
    process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";

  if (useEmulator && !globalForFirebase.__firestore_emulator_connected__) {
    const [host, port] = emulatorHost.split(":");
    connectFirestoreEmulator(firestore, host, Number(port));
    globalForFirebase.__firestore_emulator_connected__ = true;
    console.log(`[firebase] Firestore emulator connected at ${host}:${port}`);
  }

  globalForFirebase.__firestore_db__ = firestore;
  return firestore;
}

export const db = getFirestoreInstance();