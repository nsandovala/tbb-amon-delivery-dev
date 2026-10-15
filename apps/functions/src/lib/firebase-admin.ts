import admin from "firebase-admin";
import { env } from "./env";

let db: admin.firestore.Firestore;

/**
 * Singleton Firestore Admin instance.
 * Initialized once; emulator host is set before init if applicable.
 */
export function getDb(): admin.firestore.Firestore {
  if (db) return db;

  ensureApp();
  db = admin.firestore();
  return db;
}

/**
 * Auth Admin instance. In the emulator suite, FIREBASE_AUTH_EMULATOR_HOST is
 * injected by the Functions emulator, so ID tokens are verified locally.
 */
export function getAdminAuth(): admin.auth.Auth {
  ensureApp();
  return admin.auth();
}

function ensureApp(): void {
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: env.projectId });
  }
}
