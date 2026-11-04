#!/usr/bin/env node
/**
 * tools/bootstrap-owner.mjs
 *
 * Bootstrap privilegiado del owner inicial de un tenant.
 *
 * Reglas:
 * - Idempotente: si el documento ya existe como `owner/active`, no reescribe
 *   `createdAt`/`createdByUid`.
 * - Nunca autoproclama: `--uid` debe diferir de `--created-by-uid`.
 * - No reactiva memberships revocadas sin flag explícito `--reactivate`:
 *   evita que un operador reponga por accidente un acceso que otro operador
 *   revocó deliberadamente. La reactivación conserva `createdAt` original.
 * - Fuera del emulador exige confirmación inequívoca
 *   `--i-understand-this-is-not-emulator` para prevenir corridas accidentales
 *   contra Firestore real.
 * - `--dry-run` imprime el payload planeado sin escribir en Firestore. Como sí
 *   lee el tenant y la membresía, fuera del emulador también exige
 *   `--i-understand-this-is-not-emulator`.
 * - DEPLOY-READY-01: exige `--project <id>` y aborta si el proyecto del entorno
 *   (GCLOUD_PROJECT, GOOGLE_CLOUD_PROJECT, FIREBASE_PROJECT_ID, FIREBASE_CONFIG
 *   o el `project_id` de GOOGLE_APPLICATION_CREDENTIALS) apunta a otro. Admin
 *   SDK se inicializa con ese proyecto explícito, nunca con el que infiera ADC.
 *   Los proyectos `demo-*` solo existen en el emulador.
 *
 * Uso contra Firebase Emulator (primera corrida recomendada):
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *   GCLOUD_PROJECT=demo-amon-ci \
 *   node tools/bootstrap-owner.mjs --project demo-amon-ci \
 *     --tenant tbb --uid <AUTH_UID> --created-by-uid system:bootstrap
 *
 * Uso contra proyecto real (requiere aprobación humana explícita):
 *   GOOGLE_APPLICATION_CREDENTIALS=/ruta/sa.json \
 *   node tools/bootstrap-owner.mjs --project <proyecto-aprobado> \
 *     --tenant <id> --uid <uid> --created-by-uid <operador> \
 *     --i-understand-this-is-not-emulator
 */

import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    project: { type: "string" },
    tenant: { type: "string" },
    uid: { type: "string" },
    "created-by-uid": { type: "string" },
    "dry-run": { type: "boolean", default: false },
    reactivate: { type: "boolean", default: false },
    "i-understand-this-is-not-emulator": { type: "boolean", default: false },
  },
});

const projectId = values.project;
const tenantId = values.tenant;
const uid = values.uid;
const createdByUid = values["created-by-uid"];
const dryRun = values["dry-run"] === true;
const allowReactivate = values.reactivate === true;
const prodConfirmed = values["i-understand-this-is-not-emulator"] === true;

const EXIT = {
  BAD_INPUT: 2,
  MISSING_TENANT: 3,
  REVOKED_WITHOUT_FLAG: 4,
  PROD_CONFIRMATION_MISSING: 5,
  PROJECT_MISMATCH: 6,
};

const PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
if (!projectId || !PROJECT_ID.test(projectId)) {
  console.error("Required: --project <firebase-project-id> (the project this run must touch).");
  process.exit(EXIT.BAD_INPUT);
}

if (!tenantId || !uid || !createdByUid) {
  console.error("Required: --tenant <id> --uid <auth-uid> --created-by-uid <operator-uid>");
  process.exit(EXIT.BAD_INPUT);
}
if (uid === createdByUid) {
  console.error("Refusing to self-promote: --uid and --created-by-uid must differ.");
  process.exit(EXIT.BAD_INPUT);
}

const isEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
// DEPLOY-READY-01: `--dry-run` también lee Firestore (tenant y membresía), así
// que fuera del emulador exige la misma confirmación explícita.
if (!isEmulator && !prodConfirmed) {
  console.error(
    "FIRESTORE_EMULATOR_HOST is not set and --i-understand-this-is-not-emulator was not provided."
  );
  console.error("Refusing to touch a real Firestore project without explicit confirmation.");
  process.exit(EXIT.PROD_CONFIRMATION_MISSING);
}

if (!isEmulator && projectId.startsWith("demo-")) {
  console.error(`Refusing to use demo project "${projectId}" outside the emulator.`);
  process.exit(EXIT.PROJECT_MISMATCH);
}

/** Proyectos que el entorno haría usar a Admin SDK/ADC; todos deben coincidir con --project. */
function ambientProjects() {
  const found = [];
  for (const name of ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT", "FIREBASE_PROJECT_ID"]) {
    const value = process.env[name]?.trim();
    if (value) found.push([name, value]);
  }
  if (process.env.FIREBASE_CONFIG) {
    try {
      const raw = process.env.FIREBASE_CONFIG.trim();
      const config = JSON.parse(raw.startsWith("{") ? raw : readFileSync(raw, "utf8"));
      if (config.projectId) found.push(["FIREBASE_CONFIG.projectId", config.projectId]);
    } catch {
      found.push(["FIREBASE_CONFIG", "(unreadable)"]);
    }
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      const credentials = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
      if (credentials.project_id) found.push(["GOOGLE_APPLICATION_CREDENTIALS.project_id", credentials.project_id]);
    } catch {
      found.push(["GOOGLE_APPLICATION_CREDENTIALS", "(unreadable)"]);
    }
  }
  return found;
}

const mismatches = ambientProjects().filter(([, value]) => value !== projectId);
if (mismatches.length > 0) {
  console.error(`--project "${projectId}" does not match the environment:`);
  for (const [name, value] of mismatches) console.error(`  ${name} = ${value}`);
  console.error("Refusing to run against an ambiguous project.");
  process.exit(EXIT.PROJECT_MISMATCH);
}

if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}
if (admin.app().options.projectId !== projectId) {
  console.error(`Admin SDK resolved project "${admin.app().options.projectId}", expected "${projectId}".`);
  process.exit(EXIT.PROJECT_MISMATCH);
}
const db = admin.firestore();

const tenantRef = db.collection("tenants").doc(tenantId);
const memberRef = tenantRef.collection("members").doc(uid);

const tenantSnap = await tenantRef.get();
if (!tenantSnap.exists) {
  console.error(`Tenant tenants/${tenantId} does not exist. Create it before bootstrapping an owner.`);
  process.exit(EXIT.MISSING_TENANT);
}

const existing = await memberRef.get();
const now = admin.firestore.FieldValue.serverTimestamp();

if (!existing.exists) {
  const payload = {
    uid,
    tenantId,
    role: "owner",
    status: "active",
    createdAt: now,
    updatedAt: now,
    createdByUid,
  };
  if (dryRun) {
    console.log(`[dry-run] would create tenants/${tenantId}/members/${uid}:`, payload);
    process.exit(0);
  }
  await memberRef.set(payload);
  console.log(`Created tenants/${tenantId}/members/${uid} as owner/active.`);
  process.exit(0);
}

const data = existing.data() ?? {};
if (data.role === "owner" && data.status === "active") {
  console.log(`No-op: tenants/${tenantId}/members/${uid} is already owner/active.`);
  process.exit(0);
}

// A partir de aquí el documento existe pero NO es owner/active.
// Caso riesgoso: membership revocada. Exigimos un flag explícito para
// distinguir "reactivación consciente" de "promoción por accidente".
if (data.status === "revoked" && !allowReactivate) {
  console.error(
    `Refusing to reactivate revoked membership tenants/${tenantId}/members/${uid}.`
  );
  console.error("Rerun with --reactivate if this is intentional.");
  process.exit(EXIT.REVOKED_WITHOUT_FLAG);
}

// Promoción (p. ej. admin → owner) o reactivación aprobada.
const payload = {
  role: "owner",
  status: "active",
  updatedAt: now,
  // revokedAt/revokedByUid se limpian al reactivar.
  ...(data.revokedAt ? { revokedAt: admin.firestore.FieldValue.delete() } : {}),
  ...(data.revokedByUid ? { revokedByUid: admin.firestore.FieldValue.delete() } : {}),
};
if (dryRun) {
  const action = data.status === "revoked" ? "reactivate" : "promote";
  console.log(`[dry-run] would ${action} tenants/${tenantId}/members/${uid}:`, payload);
  process.exit(0);
}
await memberRef.set(payload, { merge: true });
console.log(
  data.status === "revoked"
    ? `Reactivated tenants/${tenantId}/members/${uid} as owner/active (createdAt preserved).`
    : `Promoted tenants/${tenantId}/members/${uid} to owner/active.`
);
