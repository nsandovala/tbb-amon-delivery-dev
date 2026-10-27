import { test, expect } from "@playwright/test";
import {
  deriveIdempotentOrderId,
  fingerprintOrderIntent,
  idempotencyKeySchema,
} from "../../apps/functions/src/lib/idempotency";
import { createOrderSchema, createPosSaleSchema } from "../../apps/functions/src/schemas/order.shared";

/**
 * ORDER-IDEMPOTENCY v1 — piezas puras de la primitiva (sin emulador).
 * La atomicidad y el replay se prueban en e2e/api/order-idempotency.contract.spec.ts.
 */

const KEY = "3f6c2a9e-8b1d-4e7f-9a2c-5d8e1f0b7c64";

test.describe("deriveIdempotentOrderId", () => {
  test("es determinista y tiene el formato de un ID automático de Firestore", () => {
    const a = deriveIdempotentOrderId("tbb", "web", KEY);
    expect(a).toBe(deriveIdempotentOrderId("tbb", "web", KEY));
    expect(a).toMatch(/^[A-Za-z0-9]{20}$/);
  });

  test("separa tenant, canal y clave", () => {
    const base = deriveIdempotentOrderId("tbb", "web", KEY);
    expect(deriveIdempotentOrderId("otro", "web", KEY)).not.toBe(base);
    expect(deriveIdempotentOrderId("tbb", "admin_pos", KEY)).not.toBe(base);
    expect(deriveIdempotentOrderId("tbb", "web", `${KEY}x`)).not.toBe(base);
  });

  test("no contiene la clave en claro", () => {
    expect(deriveIdempotentOrderId("tbb", "web", KEY)).not.toContain(KEY.slice(0, 8));
  });

  test("1.000 claves aleatorias producen 1.000 IDs distintos", () => {
    const ids = new Set(
      Array.from({ length: 1000 }, () => deriveIdempotentOrderId("tbb", "web", crypto.randomUUID()))
    );
    expect(ids.size).toBe(1000);
  });
});

test.describe("fingerprintOrderIntent", () => {
  const intent = {
    channel: "web",
    items: [{ productId: "burger", qty: 2 }],
    customer: { name: "Ana", phone: "+56912345678", address: "", notes: "" },
    fulfillmentType: "pickup",
    paymentMethod: "cash",
  };

  test("no depende del orden de las propiedades ni de campos undefined", () => {
    const reordered = {
      paymentMethod: "cash",
      fulfillmentType: "pickup",
      customer: { notes: "", address: "", phone: "+56912345678", name: "Ana", email: undefined },
      items: [{ qty: 2, productId: "burger" }],
      channel: "web",
    };
    expect(fingerprintOrderIntent(reordered)).toBe(fingerprintOrderIntent(intent));
  });

  test("cambia con cualquier dato de la compra", () => {
    const base = fingerprintOrderIntent(intent);
    expect(fingerprintOrderIntent({ ...intent, items: [{ productId: "burger", qty: 3 }] })).not.toBe(base);
    expect(fingerprintOrderIntent({ ...intent, paymentMethod: "transfer" })).not.toBe(base);
    expect(fingerprintOrderIntent({ ...intent, customer: { ...intent.customer, notes: "sin cebolla" } })).not.toBe(base);
    expect(fingerprintOrderIntent({ ...intent, channel: "admin_pos" })).not.toBe(base);
  });
});

test.describe("idempotencyKey en los esquemas", () => {
  const order = {
    items: [{ productId: "burger", qty: 1 }],
    customer: { name: "Ana", phone: "+56912345678" },
    fulfillmentType: "pickup",
  };

  test("acepta UUID v4 y hex de 32 caracteres", () => {
    expect(idempotencyKeySchema.safeParse(KEY).success).toBe(true);
    expect(idempotencyKeySchema.safeParse("a".repeat(32)).success).toBe(true);
  });

  test("es obligatorio en createOrder y createPosSale", () => {
    expect(createOrderSchema.safeParse(order).success).toBe(false);
    expect(createOrderSchema.safeParse({ ...order, idempotencyKey: KEY }).success).toBe(true);
    expect(createPosSaleSchema.safeParse({ ...order, customer: { name: "Mostrador" } }).success).toBe(false);
    expect(
      createPosSaleSchema.safeParse({ ...order, customer: { name: "Mostrador" }, idempotencyKey: KEY }).success
    ).toBe(true);
  });

  test("rechaza claves cortas, largas o con caracteres no seguros", () => {
    for (const key of ["corta", "a".repeat(129), "con espacios 1234567", "barra/1234567890123", ""]) {
      expect(idempotencyKeySchema.safeParse(key).success, key).toBe(false);
    }
  });
});
