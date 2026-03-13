import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// cargar .env desde la raíz del proyecto
dotenv.config({
    path: path.resolve(__dirname, "../../../.env"),
});
const projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId)
    throw new Error("Missing FIREBASE_PROJECT_ID");
const target = process.env.SEED_TARGET ?? "emulator";
const useEmulator = target === "emulator";
// Inicializa Admin SDK
admin.initializeApp({
    projectId,
});
const db = admin.firestore();
if (useEmulator) {
    // Firestore emulator (Admin SDK respeta FIRESTORE_EMULATOR_HOST)
    console.log("🌱 Seeding to Firestore Emulator...");
}
else {
    console.log("🌱 Seeding to PRODUCTION Firestore...");
}
function now() {
    return admin.firestore.FieldValue.serverTimestamp();
}
async function run() {
    const tenantId = "tbb";
    const tenantRef = db.collection("tenants").doc(tenantId);
    // 1) Tenant
    await tenantRef.set({
        id: tenantId,
        name: "The Best Burger – Receta de la Abuela",
        slug: "tbb",
        currency: "CLP",
        country: "CL",
        theme: {
            mode: "dark",
            accent: "neonGreen",
        },
        createdAt: now(),
        updatedAt: now(),
    });
    // 2) Productos base
    const products = [
        {
            id: "vader-burger",
            name: "Vader Burger",
            description: "Oscura, intensa, y se siente en la Fuerza.",
            price: 7990,
            isActive: true,
            tags: ["burger", "top"],
            imageUrl: "",
        },
        {
            id: "super-mechada",
            name: "Súper Mechada",
            description: "Receta nostálgica, power real.",
            price: 7490,
            isActive: true,
            tags: ["mechada", "top"],
            imageUrl: "",
        },
        {
            id: "papas",
            name: "Papas",
            description: "Crujientes. Punto.",
            price: 2490,
            isActive: true,
            tags: ["side"],
            imageUrl: "",
        },
    ];
    const batch = db.batch();
    for (const p of products) {
        const ref = tenantRef.collection("products").doc(p.id);
        batch.set(ref, {
            ...p,
            tenantId,
            createdAt: now(),
            updatedAt: now(),
        });
    }
    await batch.commit();
    // 2.5) Categorías
    const categories = [
        { id: "burgers", name: "Burgers", slug: "burgers", order: 1 },
        { id: "mechadas", name: "Mechadas", slug: "mechadas", order: 2 },
        { id: "acompañamientos", name: "Acompañamientos", slug: "acompañamientos", order: 3 },
    ];
    const batchCat = db.batch();
    for (const cat of categories) {
        const ref = tenantRef.collection("categories").doc(cat.id);
        batchCat.set(ref, {
            ...cat,
            tenantId,
            createdAt: now(),
            updatedAt: now(),
        });
    }
    await batchCat.commit();
    // 3) Modificadores (opcional, pero recomendado)
    const modifiers = [
        { id: "extra-queso", name: "Extra queso", priceDelta: 800 },
        { id: "sin-cebolla", name: "Sin cebolla", priceDelta: 0 },
        { id: "extra-salsa", name: "Extra salsa", priceDelta: 500 },
    ];
    const batch2 = db.batch();
    for (const m of modifiers) {
        const ref = tenantRef.collection("modifiers").doc(m.id);
        batch2.set(ref, {
            ...m,
            tenantId,
            isActive: true,
            createdAt: now(),
            updatedAt: now(),
        });
    }
    await batch2.commit();
    // 4) Órdenes demo (para probar UI tipo Uber)
    const orders = [
        {
            id: "order-001",
            status: "preparing",
            channel: "own",
            items: [
                { productId: "vader-burger", qty: 1, unitPrice: 7990 },
                { productId: "papas", qty: 1, unitPrice: 2490 },
            ],
            modifiers: [{ modifierId: "extra-queso", qty: 1, unitPrice: 800 }],
            totals: { subtotal: 11280, delivery: 0, total: 11280 },
            customer: { name: "Cliente Demo", phone: "+56900000000" },
            createdAt: now(),
            updatedAt: now(),
        },
        {
            id: "order-002",
            status: "queued",
            channel: "uber",
            items: [{ productId: "super-mechada", qty: 2, unitPrice: 7490 }],
            totals: { subtotal: 14980, delivery: 0, total: 14980 },
            customer: { name: "Uber Eats", phone: "" },
            createdAt: now(),
            updatedAt: now(),
        },
    ];
    const batch3 = db.batch();
    for (const o of orders) {
        const ref = tenantRef.collection("orders").doc(o.id);
        batch3.set(ref, { ...o, tenantId });
    }
    await batch3.commit();
    console.log("✅ Seed completo:", { tenantId, products: products.length, categories: categories.length, orders: orders.length });
}
run().catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
});
