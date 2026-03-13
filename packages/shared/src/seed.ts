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

// Cargar .env desde la raíz del proyecto
dotenv.config({
  path: path.resolve(__dirname, "../../../.env"),
});

const projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId) throw new Error("Missing FIREBASE_PROJECT_ID");

const target = process.env.SEED_TARGET ?? "emulator";
const useEmulator = target === "emulator";

// Inicializar Admin SDK solo una vez
if (!admin.apps.length) {
  admin.initializeApp({
    projectId,
  });
}

const db = admin.firestore();

if (useEmulator) {
  console.log("🌱 Seeding to Firestore Emulator...");
} else {
  console.log("🌱 Seeding to PRODUCTION Firestore...");
}

function now() {
  return admin.firestore.FieldValue.serverTimestamp();
}

async function run() {
  const tenantId = TBB_TENANT.id;
  const tenantRef = db.collection("tenants").doc(tenantId);

  // 1) Tenant
  await tenantRef.set({
    ...TBB_TENANT,
    createdAt: now(),
    updatedAt: now(),
  });

  // 2) Categorías
  const batchCategories = db.batch();
  for (const category of TBB_CATEGORIES) {
    const ref = tenantRef.collection("categories").doc(category.id);
    batchCategories.set(ref, {
      ...category,
      createdAt: now(),
      updatedAt: now(),
    });
  }
  await batchCategories.commit();

  // 3) Productos
  const batchProducts = db.batch();
  for (const product of TBB_PRODUCTS) {
    const ref = tenantRef.collection("products").doc(product.id);
    batchProducts.set(ref, {
      ...product,
      tenantId,
      createdAt: now(),
      updatedAt: now(),
    });
  }
  await batchProducts.commit();

  // 4) Modifier groups
  const batchModifierGroups = db.batch();
  for (const group of TBB_MODIFIER_GROUPS) {
    const ref = tenantRef.collection("modifier_groups").doc(group.id);
    batchModifierGroups.set(ref, {
      ...group,
      createdAt: now(),
      updatedAt: now(),
    });
  }
  await batchModifierGroups.commit();

  // 5) Modifiers
  const batchModifiers = db.batch();
  for (const modifier of TBB_MODIFIERS) {
    const ref = tenantRef.collection("modifiers").doc(modifier.id);
    batchModifiers.set(ref, {
      ...modifier,
      createdAt: now(),
      updatedAt: now(),
    });
  }
  await batchModifiers.commit();

  // 6) Settings
  await tenantRef.collection("settings").doc("default").set({
    ...TBB_SETTINGS,
    createdAt: now(),
    updatedAt: now(),
  });

  // 7) Órdenes demo
  const batchOrders = db.batch();
  for (const order of TBB_ORDERS) {
    const ref = tenantRef.collection("orders").doc(order.id);
    batchOrders.set(ref, {
      ...order,
      tenantId,
      createdAt: now(),
      updatedAt: now(),
    });
  }
  await batchOrders.commit();

  console.log("✅ Seed completo:", {
    tenantId,
    categories: TBB_CATEGORIES.length,
    products: TBB_PRODUCTS.length,
    modifierGroups: TBB_MODIFIER_GROUPS.length,
    modifiers: TBB_MODIFIERS.length,
    orders: TBB_ORDERS.length,
  });
}

run().catch((e) => {
  console.error("❌ Seed failed:", e);
  process.exit(1);
});