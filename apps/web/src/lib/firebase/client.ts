import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

const firebaseConfig = {
 apiKey: "dev",
 authDomain: "dev",
 projectId: "minerp-sentinel",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);

if (process.env.NEXT_PUBLIC_USE_EMULATOR === "true") {
 connectFirestoreEmulator(db, "127.0.0.1", 8080);
}