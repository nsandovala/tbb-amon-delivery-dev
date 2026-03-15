import { getApp, getApps, initializeApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "dev",
  authDomain: "dev",
  projectId: "minerp-sentinel"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);

if (typeof window !== "undefined") {
  const w = window as typeof window & { __admin_firestore_emulator__?: boolean };

  if (!w.__admin_firestore_emulator__) {
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    w.__admin_firestore_emulator__ = true;
  }
}
