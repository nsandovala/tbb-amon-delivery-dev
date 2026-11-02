import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from "firebase/firestore";
import { FIREBASE_CONFIG, FIRESTORE_EMULATOR_HOST, USE_FIRESTORE_EMULATOR } from "../public-env";

// DEPLOY-READY-01: sin valores de desarrollo en un build productivo (ver public-env).
const firebaseConfig = FIREBASE_CONFIG;

const globalForFirebase = globalThis as typeof globalThis & {
  __web_firebase_app__?: FirebaseApp;
  __web_firestore_db__?: Firestore;
  __web_firestore_emulator_connected__?: boolean;
};

function getFirebaseAppInstance(): FirebaseApp {
  if (globalForFirebase.__web_firebase_app__) {
    return globalForFirebase.__web_firebase_app__;
  }

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  globalForFirebase.__web_firebase_app__ = app;
  return app;
}

function getFirestoreInstance(): Firestore {
  if (globalForFirebase.__web_firestore_db__) {
    return globalForFirebase.__web_firestore_db__;
  }

  const firestore = getFirestore(getFirebaseAppInstance());

  const useEmulator = USE_FIRESTORE_EMULATOR;
  const emulatorHost = FIRESTORE_EMULATOR_HOST;

  if (
    typeof window !== "undefined" &&
    useEmulator &&
    !globalForFirebase.__web_firestore_emulator_connected__
  ) {
    const [host, port] = emulatorHost.split(":");

    if (!host || !port) {
      throw new Error(
        `[web/firebase] Invalid NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST: "${emulatorHost}"`
      );
    }

    connectFirestoreEmulator(firestore, host, Number(port));
    globalForFirebase.__web_firestore_emulator_connected__ = true;

    console.log(`[web/firebase] Firestore emulator connected at ${host}:${port}`);
  }

  globalForFirebase.__web_firestore_db__ = firestore;
  return firestore;
}

export const db = getFirestoreInstance();