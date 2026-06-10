#!/usr/bin/env node
/**
 * One-shot script to set admin custom claim on a Firebase Auth user.
 * Usage:
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node tools/set-admin-claim.mjs <email> [password]
 *
 * If the user doesn't exist, password is required to create them.
 * Works against the emulator when FIREBASE_AUTH_EMULATOR_HOST is set.
 *
 * If firebase-admin is not found from here, run via:
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm --prefix apps/functions exec -- node ../../tools/set-admin-claim.mjs <email> [password]
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Try to resolve firebase-admin from functions workspace first, then root
let admin;
try {
  const require = createRequire(
    path.join(__dirname, "../apps/functions/package.json")
  );
  admin = require("firebase-admin");
} catch {
  try {
    const require = createRequire(path.join(__dirname, "../package.json"));
    admin = require("firebase-admin");
  } catch {
    console.error(
      "❌ firebase-admin not found. Run via:\n" +
        "   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm --prefix apps/functions exec -- node ../../tools/set-admin-claim.mjs <email> [password]"
    );
    process.exit(1);
  }
}

const [, , email, password] = process.argv;

if (!email) {
  console.error("Usage: node tools/set-admin-claim.mjs <email> [password]");
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({ projectId: "minerp-sentinel" });
}

const authAdmin = admin.auth();

async function run() {
  let uid;

  try {
    const existing = await authAdmin.getUserByEmail(email);
    uid = existing.uid;
    console.log(`✓ Usuario encontrado: ${email} (${uid})`);
  } catch (err) {
    if (err.code !== "auth/user-not-found") throw err;

    if (!password) {
      console.error(
        `❌ Usuario "${email}" no existe y no se proporcionó password para crearlo.`
      );
      process.exit(1);
    }

    const created = await authAdmin.createUser({ email, password });
    uid = created.uid;
    console.log(`✓ Usuario creado: ${email} (${uid})`);
  }

  await authAdmin.setCustomUserClaims(uid, { admin: true });
  console.log(`✅ Claim admin:true seteado en ${email}`);
}

run().catch((err) => {
  console.error("❌ Error:", err.message ?? err);
  process.exit(1);
});
