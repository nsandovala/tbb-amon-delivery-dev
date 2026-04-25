import admin from "firebase-admin";
/**
 * Singleton Firestore Admin instance.
 * Initialized once; emulator host is set before init if applicable.
 */
export declare function getDb(): admin.firestore.Firestore;
