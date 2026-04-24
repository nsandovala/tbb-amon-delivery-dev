import admin from "firebase-admin";
import { env } from "./env";

let db: admin.firestore.Firestore;

/**
 * Singleton Firestore Admin instance.
 * Initialized once; emulator host is set before init if applicable.
 */
export function getDb(): admin.firestore.Firestore {
  if (db) return db;

  if (!admin.apps.length) {
    admin.initializeApp({ projectId: env.projectId });
  }

  db = admin.firestore();
  return db;
}
