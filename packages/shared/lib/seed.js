import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { TBB_TENANT } from "./data/tbb/tenant.js";
import { TBB_CATEGORIES } from "./data/tbb/categories.js";
import { TBB_PRODUCTS } from "./data/tbb/products.js";
import { TBB_MODIFIER_GROUPS, TBB_MODIFIERS } from "./data/tbb/modifiers.js";
import { TBB_SETTINGS } from "./data/tbb/settings.js";
import { TBB_ORDERS } from "./data/tbb/orders.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({
    path: path.resolve(__dirname, "../../../.env"),
});
console.log("cwd:", process.cwd());
console.log("__dirname:", __dirname);
console.log("env path:", path.resolve(__dirname, "../../../.env"));
console.log("FIREBASE_PROJECT_ID:", process.env.FIREBASE_PROJECT_ID);
function requireEnv(name) {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing required env: ${name}`);
    }
    return value;
}
const projectId = requireEnv("FIREBASE_PROJECT_ID");
const target = (process.env.SEED_TARGET?.trim() || "emulator");
const useEmulator = target === "emulator";
if (target !== "emulator" && target !== "production") {
    throw new Error(`Invalid SEED_TARGET="${process.env.SEED_TARGET}". Use "emulator" or "production".`);
}
if (!useEmulator && process.env.ALLOW_PRODUCTION_SEED !== "true") {
    throw new Error('Production seed blocked. Set ALLOW_PRODUCTION_SEED="true" only when you really mean it.');
}
if (useEmulator) {
    const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ||
        process.env.FIREBASE_FIRESTORE_EMULATOR_HOST ||
        "127.0.0.1:8080";
    process.env.FIRESTORE_EMULATOR_HOST = emulatorHost;
    console.log(`🌱 Seeding to Firestore Emulator at ${emulatorHost}...`);
}
else {
    console.log(`🌱 Seeding to PRODUCTION Firestore (${projectId})...`);
}
if (!getApps().length) {
    initializeApp({ projectId });
}
const db = getFirestore();
function now() {
    return FieldValue.serverTimestamp();
}
// Helpers
async function setTenant() {
    await db.collection("tenants").doc(TBB_TENANT.id).set({
        ...TBB_TENANT,
        createdAt: now(),
        updatedAt: now(),
    });
}
async function seedCategories() {
    const batch = db.batch();
    for (const category of TBB_CATEGORIES) {
        const ref = db
            .collection("tenants")
            .doc(TBB_TENANT.id)
            .collection("categories")
            .doc(category.id);
        batch.set(ref, {
            ...category,
            createdAt: now(),
            updatedAt: now(),
        });
    }
    await batch.commit();
}
async function seedProducts() {
    const batch = db.batch();
    for (const product of TBB_PRODUCTS) {
        const ref = db
            .collection("tenants")
            .doc(TBB_TENANT.id)
            .collection("products")
            .doc(product.id);
        batch.set(ref, {
            ...product,
            createdAt: now(),
            updatedAt: now(),
        });
    }
    await batch.commit();
}
async function seedModifiers() {
    const batch = db.batch();
    for (const group of TBB_MODIFIER_GROUPS) {
        const ref = db
            .collection("tenants")
            .doc(TBB_TENANT.id)
            .collection("modifierGroups")
            .doc(group.id);
        batch.set(ref, {
            ...group,
            createdAt: now(),
            updatedAt: now(),
        });
    }
    for (const modifier of TBB_MODIFIERS) {
        const ref = db
            .collection("tenants")
            .doc(TBB_TENANT.id)
            .collection("modifiers")
            .doc(modifier.id);
        batch.set(ref, {
            ...modifier,
            createdAt: now(),
            updatedAt: now(),
        });
    }
    await batch.commit();
}
async function seedSettings() {
    await db
        .collection("tenants")
        .doc(TBB_TENANT.id)
        .collection("settings")
        .doc("store")
        .set({
        ...TBB_SETTINGS,
        updatedAt: now(),
    });
}
async function seedOrders() {
    const batch = db.batch();
    for (const order of TBB_ORDERS) {
        const ref = db
            .collection("tenants")
            .doc(TBB_TENANT.id)
            .collection("orders")
            .doc(order.id);
        batch.set(ref, {
            ...order,
            createdAt: now(),
            updatedAt: now(),
        });
    }
    await batch.commit();
}
async function main() {
    await setTenant();
    await seedCategories();
    await seedProducts();
    await seedModifiers();
    await seedSettings();
    await seedOrders();
    console.log("✅ Seed completo:", {
        tenantId: TBB_TENANT.id,
        target,
        categories: TBB_CATEGORIES.length,
        products: TBB_PRODUCTS.length,
        modifierGroups: TBB_MODIFIER_GROUPS.length,
        modifiers: TBB_MODIFIERS.length,
        orders: TBB_ORDERS.length,
    });
}
main().catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exit(1);
});
