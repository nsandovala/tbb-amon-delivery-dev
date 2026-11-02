#!/usr/bin/env node
/**
 * One-shot script to set admin custom claim on a Firebase Auth user.
 * Usage:
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node tools/set-admin-claim.mjs --project <id> <email> [password]
 *
 * If the user doesn't exist, password is required to create them.
 * Emulator only: aborts without FIREBASE_AUTH_EMULATOR_HOST, without
 * `--project`, or when `--project` differs from GCLOUD_PROJECT.
 *
 * If firebase-admin is not found from here, run via:
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm --prefix apps/functions exec -- node ../../tools/set-admin-claim.mjs --project <id> <email> [password]
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import { parseArgs } from "node:util";
import path from "path";

// DEPLOY-READY-01: herramienta legada SOLO para el emulador de Auth. Desde
// SEC-BASE el claim `admin` no concede acceso (manda la membresía; ver
// tools/bootstrap-owner.mjs). Sin emulador no toca ningún proyecto real.
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST?.trim()) {
  console.error(
    "❌ FIREBASE_AUTH_EMULATOR_HOST no está definida. set-admin-claim.mjs es solo para el emulador de Auth."
  );
  process.exit(1);
}

// Proyecto explícito, sin valor por defecto: el usuario se crea en el Auth
// emulado de ese proyecto y en ningún otro.
const { values, positionals } = parseArgs({
  options: { project: { type: "string" } },
  allowPositionals: true,
});
const projectId = values.project?.trim();
if (!projectId) {
  console.error("❌ Falta --project <id> (proyecto del emulador en curso).");
  process.exit(1);
}
const ambientProject = process.env.GCLOUD_PROJECT?.trim();
if (ambientProject && ambientProject !== projectId) {
  console.error(`❌ --project "${projectId}" no coincide con GCLOUD_PROJECT "${ambientProject}".`);
  process.exit(1);
}

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

const [email, password] = positionals;

if (!email) {
  console.error("Usage: node tools/set-admin-claim.mjs --project <id> <email> [password]");
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({ projectId });
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
