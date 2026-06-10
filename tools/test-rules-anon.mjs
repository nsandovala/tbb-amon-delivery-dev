#!/usr/bin/env node
/**
 * Validates Firestore security rules from an anonymous (unauthenticated) perspective.
 *
 * Assertions:
 *   1. Public read of tenants/tbb/products → PASS
 *   2. Anonymous read of tenants/tbb/orders → FAIL (permission-denied)
 *   3. Anonymous write to a test path       → FAIL (permission-denied)
 *
 * Requires Firestore Emulator running at 127.0.0.1:8080.
 *
 * If firebase/firestore is not found, run from a workspace that has it:
 *   npm --workspace apps/web exec -- node ../../tools/test-rules-anon.mjs
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let initializeApp, getFirestore, connectFirestoreEmulator, collection, getDocs, addDoc;

try {
  const requireApp = createRequire(
    path.join(__dirname, "../apps/web/node_modules/firebase/app/package.json")
  );
  // Use dynamic import for ESM firebase packages
  ({ initializeApp } = await import("../apps/web/node_modules/firebase/app/dist/index.mjs").catch(() =>
    import("firebase/app")
  ));
  ({ getFirestore, connectFirestoreEmulator, collection, getDocs, addDoc } =
    await import("../apps/web/node_modules/firebase/firestore/dist/index.mjs").catch(() =>
      import("firebase/firestore")
    ));
} catch {
  try {
    ({ initializeApp } = await import("firebase/app"));
    ({ getFirestore, connectFirestoreEmulator, collection, getDocs, addDoc } =
      await import("firebase/firestore"));
  } catch {
    console.error(
      "❌ firebase/firestore not found. Run via:\n" +
        "   npm --workspace apps/web exec -- node ../../tools/test-rules-anon.mjs\n" +
        "   or: npm --workspace apps/admin exec -- node ../../tools/test-rules-anon.mjs"
    );
    process.exit(1);
  }
}

const app = initializeApp(
  { projectId: "minerp-sentinel" },
  "test-rules-anon"
);
const db = getFirestore(app);
connectFirestoreEmulator(db, "127.0.0.1", 8080);

let passed = 0;
let failed = 0;

async function assert(label, fn, expectDenied = false) {
  try {
    await fn();
    if (expectDenied) {
      console.error(`❌ [FAIL] ${label} — esperaba permission-denied pero pasó`);
      failed++;
    } else {
      console.log(`✅ [PASS] ${label}`);
      passed++;
    }
  } catch (err) {
    const isDenied =
      err?.code === "permission-denied" ||
      err?.message?.includes("permission-denied") ||
      err?.message?.includes("Missing or insufficient permissions");

    if (expectDenied && isDenied) {
      console.log(`✅ [PASS] ${label} — bloqueado correctamente`);
      passed++;
    } else if (!expectDenied) {
      console.error(`❌ [FAIL] ${label} — error inesperado: ${err?.message}`);
      failed++;
    } else {
      console.error(`❌ [FAIL] ${label} — error distinto al esperado: ${err?.message}`);
      failed++;
    }
  }
}

// 1. Public read of products must succeed
await assert(
  "Lectura pública de tenants/tbb/products",
  () => getDocs(collection(db, "tenants/tbb/products"))
);

// 2. Anonymous read of orders must be denied
await assert(
  "Lectura anónima de tenants/tbb/orders bloqueada",
  () => getDocs(collection(db, "tenants/tbb/orders")),
  true
);

// 3. Anonymous write must be denied
await assert(
  "Escritura anónima a tenants/tbb/test bloqueada",
  () => addDoc(collection(db, "tenants/tbb/test"), { probe: true }),
  true
);

console.log(`\n${passed}/3 aserciones pasaron.`);
process.exit(failed > 0 ? 1 : 0);
