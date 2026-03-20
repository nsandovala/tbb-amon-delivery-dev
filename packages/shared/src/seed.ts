import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";

import { TBB_TENANT } from "./data/tbb/tenant";
import { TBB_CATEGORIES } from "./data/tbb/categories";
import { TBB_PRODUCTS } from "./data/tbb/products";
import { TBB_MODIFIER_GROUPS, TBB_MODIFIERS } from "./data/tbb/modifiers";
import { TBB_SETTINGS } from "./data/tbb/settings";
import { TBB_ORDERS } from "./data/tbb/orders";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carga variables desde la raíz del repo
dotenv.config({
  path: path.resolve(__dirname, "../../../.env"),
});

type SeedTarget = "emulator" | "production";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

const projectId = requireEnv("FIREBASE_PROJECT_ID");
const target = (process.env.SEED_TARGET?.trim() || "emulator") as SeedTarget;
const useEmulator = target === "emulator";

if (target !== "emulator" && target !== "production") {
  throw new Error(
    `Invalid SEED_TARGET="${process.env.SEED_TARGET}". Use "emulator" or "production".`
  );
}

// Seguridad: jamás sembrar producción por accidente
if (!useEmulator && process.env.ALLOW_PRODUCTION_SEED !== "true") {
  throw new Error(
    'Production seed blocked. Set ALLOW_PRODUCTION_SEED="true" only when you really mean it.'
  );
}

// Inicializa Admin SDK una sola vez
if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}

const db = admin.firestore();

if (useEmulator) {
  const emulatorHost =
    process.env.FIRESTORE_EMULATOR_HOST ||
    process.env.FIREBASE_FIRESTORE_EMULATOR_HOST ||
    "127.0.0.1:8080";

  process.env.FIRESTORE_EMULATOR_HOST = emulatorHost;

  console.log(`🌱 Seeding to Firestore Emulator at ${emulatorHost}...`);
} else {
  console.log(`🌱 Seeding to PRODUCTION Firestore (${projectId})...`);
}

function now() {
  return admin.firestore.FieldValue.serverTimestamp();
}

async function seedTenant(tenantId: string) {
  const tenantRef = db.collection("tenants").doc(tenantId);

  // 1) Tenant base
  await tenantRef.set(
    {
      ...TBB_TENANT,
      createdAt: now(),
      updatedAt: now(),
    },
    { merge: true }
  );

  // 2) Categorías
  const batchCategories = db.batch();
  for (const category of TBB_CATEGORIES) {
    const ref = tenantRef.collection("categories").doc(category.id);
    batchCategories.set(
      ref,
      {
        ...category,
        createdAt: now(),
        updatedAt: now(),
      },
      { merge: true }
    );
  }
  await batchCategories.commit();

  // 3) Productos
  const batchProducts = db.batch();
  for (const product of TBB_PRODUCTS) {
    const ref = tenantRef.collection("products").doc(product.id);
    batchProducts.set(
      ref,
      {
        ...product,
        tenantId,
        createdAt: now(),
        updatedAt: now(),
      },
      { merge: true }
    );
  }
  await batchProducts.commit();

  // 4) Modifier groups
  const batchModifierGroups = db.batch();
  for (const group of TBB_MODIFIER_GROUPS) {
    const ref = tenantRef.collection("modifier_groups").doc(group.id);
    batchModifierGroups.set(
      ref,
      {
        ...group,
        createdAt: now(),
        updatedAt: now(),
      },
      { merge: true }
    );
  }
  await batchModifierGroups.commit();

  // 5) Modifiers
  const batchModifiers = db.batch();
  for (const modifier of TBB_MODIFIERS) {
    const ref = tenantRef.collection("modifiers").doc(modifier.id);
    batchModifiers.set(
      ref,
      {
        ...modifier,
        createdAt: now(),
        updatedAt: now(),
      },
      { merge: true }
    );
  }
  await batchModifiers.commit();

  // 6) Settings
  await tenantRef.collection("settings").doc("default").set(
    {
      ...TBB_SETTINGS,
      createdAt: now(),
      updatedAt: now(),
    },
    { merge: true }
  );

  // 7) Órdenes demo
  const batchOrders = db.batch();
  for (const order of TBB_ORDERS) {
    const ref = tenantRef.collection("orders").doc(order.id);
    batchOrders.set(
      ref,
      {
        ...order,
        tenantId,
        createdAt: now(),
        updatedAt: now(),
      },
      { merge: true }
    );
  }
  await batchOrders.commit();

  console.log("✅ Seed completo:", {
    tenantId,
    target,
    categories: TBB_CATEGORIES.length,
    products: TBB_PRODUCTS.length,
    modifierGroups: TBB_MODIFIER_GROUPS.length,
    modifiers: TBB_MODIFIERS.length,
    orders: TBB_ORDERS.length,
  });
}

async function run() {
  await seedTenant(TBB_TENANT.id);
}

run().catch((error) => {
  console.error("❌ Seed failed:", error);
  process.exit(1);
});