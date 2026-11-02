import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from "firebase/firestore";
import {
  connectAuthEmulator,
  getAuth,
  type Auth,
} from "firebase/auth";
import { AUTH_EMULATOR_URL, FIREBASE_CONFIG, FIRESTORE_EMULATOR_HOST, USE_EMULATOR } from "../public-env";

// DEPLOY-READY-01: sin valores de desarrollo en un build productivo (ver public-env).
const firebaseConfig = FIREBASE_CONFIG;

const globalForFirebase = globalThis as typeof globalThis & {
  __admin_firebase_app__?: FirebaseApp;
  __admin_firestore_db__?: Firestore;
  __admin_firestore_emulator_connected__?: boolean;
  __admin_auth__?: Auth;
  __admin_auth_emulator_connected__?: boolean;
};

function getFirebaseAppInstance(): FirebaseApp {
  if (globalForFirebase.__admin_firebase_app__) {
    return globalForFirebase.__admin_firebase_app__;
  }

  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  globalForFirebase.__admin_firebase_app__ = app;
  return app;
}

function getFirestoreInstance(): Firestore {
  if (globalForFirebase.__admin_firestore_db__) {
    return globalForFirebase.__admin_firestore_db__;
  }

  const firestore = getFirestore(getFirebaseAppInstance());

  const useEmulator = USE_EMULATOR;
  const emulatorHost = FIRESTORE_EMULATOR_HOST;

  if (
    typeof window !== "undefined" &&
    useEmulator &&
    !globalForFirebase.__admin_firestore_emulator_connected__
  ) {
    const [host, port] = emulatorHost.split(":");

    if (!host || !port) {
      throw new Error(
        `[admin/firebase] Invalid NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST: "${emulatorHost}"`
      );
    }

    connectFirestoreEmulator(firestore, host, Number(port));
    globalForFirebase.__admin_firestore_emulator_connected__ = true;

    console.log(`[admin/firebase] Firestore emulator connected at ${host}:${port}`);
  }

  globalForFirebase.__admin_firestore_db__ = firestore;
  return firestore;
}

function getAuthInstance(): Auth {
  if (globalForFirebase.__admin_auth__) {
    return globalForFirebase.__admin_auth__;
  }

  const auth = getAuth(getFirebaseAppInstance());

  const useEmulator = USE_EMULATOR;

  if (
    typeof window !== "undefined" &&
    useEmulator &&
    !globalForFirebase.__admin_auth_emulator_connected__
  ) {
    connectAuthEmulator(auth, AUTH_EMULATOR_URL, {
      disableWarnings: true,
    });
    globalForFirebase.__admin_auth_emulator_connected__ = true;

    console.log(`[admin/firebase] Auth emulator connected at ${AUTH_EMULATOR_URL}`);
  }

  globalForFirebase.__admin_auth__ = auth;
  return auth;
}

export const db = getFirestoreInstance();
export const auth = getAuthInstance();