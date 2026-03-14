import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const projectId =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  "minerp-sentinel";

const useEmulator =
  process.env.USE_FIREBASE_EMULATOR === "true" ||
  process.env.NEXT_PUBLIC_USE_EMULATOR === "true";

const emulatorHost =
  process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST ||
  "127.0.0.1:8080";

if (useEmulator) {
  process.env.FIRESTORE_EMULATOR_HOST = emulatorHost;
}

if (!getApps().length) {
  initializeApp({ projectId });
}

export const adminDb = getFirestore();