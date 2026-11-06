#!/usr/bin/env node
// Run with node --import tsx. Import data only: never seed.ts or its runners.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { TBB_TENANT } from "../packages/shared/src/data/tbb/tenant.ts";
import { TBB_CATEGORIES } from "../packages/shared/src/data/tbb/categories.ts";
import { TBB_PRODUCTS } from "../packages/shared/src/data/tbb/products.ts";
import { TBB_MODIFIERS, TBB_MODIFIER_GROUPS } from "../packages/shared/src/data/tbb/modifiers.ts";
import { TBB_SETTINGS } from "../packages/shared/src/data/tbb/settings.ts";
import { TBB_STORE_HOURS } from "../packages/shared/src/data/tbb/store-hours.ts";

export const PROJECT = "tbb-amon-preview";

export function validateOptions(args, env = process.env, read = readFileSync) {
  const { values } = parseArgs({ args, options: {
    project: { type: "string" },
    auth: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    "confirm-real-project": { type: "string" },
    apply: { type: "boolean", default: false },
  } });
  if (values.project !== PROJECT) throw new Error(`Required: --project ${PROJECT}; no other project is allowed.`);
  const auth = values.auth ?? "service-account";
  if (auth !== "adc" && auth !== "service-account") throw new Error("--auth must be adc or service-account.");
  if (values.apply === values["dry-run"]) throw new Error("Choose exactly one: --dry-run or --apply.");
  const confirmed = values["confirm-real-project"];
  if (confirmed !== undefined && confirmed !== PROJECT) throw new Error("Real project confirmation mismatch.");
  if (values.apply && !confirmed) throw new Error("--apply requires --confirm-real-project tbb-amon-preview.");
  for (const key of ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT", "FIREBASE_PROJECT_ID", "CLOUDSDK_CORE_PROJECT"]) {
    if (env[key] && env[key] !== PROJECT) throw new Error(`Project mismatch in ${key}.`);
  }
  for (const key of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"]) {
    if (env[key]) throw new Error(`Unexpected emulator environment: ${key}.`);
  }
  if (env.FIREBASE_CONFIG) {
    const raw = env.FIREBASE_CONFIG.trim();
    const config = JSON.parse(raw.startsWith("{") ? raw : read(raw, "utf8"));
    if (config.projectId !== PROJECT) throw new Error("Project mismatch in FIREBASE_CONFIG.");
  }
  let credentials;
  if (auth === "adc" && env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error("ADC mode rejects GOOGLE_APPLICATION_CREDENTIALS; unset it to use default user or attached credentials.");
  }
  if (auth === "service-account" && env.GOOGLE_APPLICATION_CREDENTIALS) {
    credentials = JSON.parse(read(env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
    if (credentials.project_id !== PROJECT || credentials.type !== "service_account") {
      throw new Error("Credentials must be a service account for tbb-amon-preview.");
    }
  }
  if (confirmed && auth === "service-account" && !credentials) throw new Error("Real access requires explicit GOOGLE_APPLICATION_CREDENTIALS for tbb-amon-preview.");
  return { projectId: PROJECT, dryRun: values["dry-run"], online: Boolean(confirmed), auth, credentials };
}

export function buildPlan() {
  const root = "tenants/tbb";
  const entries = [{ path: root, data: TBB_TENANT, timestamps: "both" }];
  for (const [collection, rows] of [
    ["categories", TBB_CATEGORIES], ["products", TBB_PRODUCTS],
    ["modifiers", TBB_MODIFIERS], ["modifierGroups", TBB_MODIFIER_GROUPS],
  ]) {
    for (const data of rows) {
      if (!/^[a-zA-Z0-9_-]+$/.test(data.id) || (data.tenantId && data.tenantId !== "tbb")) {
        throw new Error("Invalid catalog identity.");
      }
      entries.push({ path: `${root}/${collection}/${data.id}`, data, timestamps: "both" });
    }
  }
  entries.push({ path: `${root}/settings/store`, data: {
    ...TBB_SETTINGS,
    cart: { ...TBB_SETTINGS.cart, showLikes: false, showRatings: false, floatingChatEnabled: false },
  }, timestamps: "updated" });
  entries.push({ path: `${root}/settings/storeHours`, data: {
    ...TBB_STORE_HOURS, schemaVersion: 1,
    updatedBy: { uid: "bootstrap-preview", email: null },
  }, timestamps: "updated" });
  if (entries.length > 500 || new Set(entries.map(e => e.path)).size !== entries.length) {
    throw new Error("Invalid plan size or duplicate paths.");
  }
  return structuredClone(entries);
}

// Transaction reads precede all creates. Firestore retries concurrent changes;
// create preconditions also prevent replacing a document created by another writer.
export async function applyPlan(db, timestamp, dryRun) {
  const plan = buildPlan();
  const refs = plan.map(entry => db.doc(entry.path));
  const inspect = (snapshots) => plan.map((entry, i) => ({
    path: entry.path, action: snapshots[i].exists ? "keep-existing-review" : "create",
  }));
  if (dryRun) return inspect(await db.getAll(...refs));
  return db.runTransaction(async tx => {
    const report = inspect(await tx.getAll(...refs));
    for (const [i, entry] of plan.entries()) {
      if (report[i].action !== "create") continue;
      tx.create(refs[i], {
        ...entry.data,
        ...(entry.timestamps === "both" ? { createdAt: timestamp() } : {}),
        updatedAt: timestamp(),
      });
    }
    return report;
  });
}

export async function main(args = process.argv.slice(2), env = process.env, connect = connectFirestore) {
  const options = validateOptions(args, env);
  const plan = buildPlan();
  if (!options.online) {
    console.log(JSON.stringify({ project: PROJECT, mode: "offline-plan", existence: "not-checked", documents: plan }, null, 2));
    return;
  }
  const connection = await connect(options);
  try {
    if (connection.projectId !== PROJECT) throw new Error("SDK project mismatch.");
    const report = await applyPlan(connection.db, connection.timestamp, options.dryRun);
    console.log(JSON.stringify({ project: PROJECT, mode: options.dryRun ? "read-only" : "applied", documents: report }, null, 2));
  } finally {
    await connection.close();
  }
}

export function selectCredential({ auth, credentials }, sdk) {
  return auth === "adc" ? sdk.applicationDefault() : sdk.cert(credentials);
}

async function connectFirestore({ projectId, auth, credentials }) {
  // Firebase is not even imported until all guards and explicit confirmation pass.
  const sdk = await import("firebase-admin/app");
  const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
  const app = sdk.initializeApp({ projectId, credential: selectCredential({ auth, credentials }, sdk) }, "bootstrap-preview");
  return { projectId: app.options.projectId, db: getFirestore(app),
    timestamp: () => FieldValue.serverTimestamp(), close: () => sdk.deleteApp(app) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
