import { test, expect } from "@playwright/test";

/**
 * Capa 1 — Contrato de la API de orders contra Firebase Emulator.
 *
 * Pre-req:
 * - npm run dev:emulators corriendo
 * - seed aplicado
 */

const TENANT = "tbb";

const validOrder = {
  items: [{ productId: "vader-burger", qty: 1 }],
  customer: { name: "E2E Bot", phone: "+56912345678" },
  fulfillmentType: "pickup" as const,
  paymentMethod: "cash" as const,
};

const validPosSale = {
  tenantId: TENANT,
  items: [{ productId: "vader-burger", qty: 1 }],
  customer: { name: "E2E POS", phone: "+56912345678" },
  fulfillmentType: "pickup" as const,
  paymentMethod: "cash" as const,
};

test.describe("Orders API contract emulator", () => {
  test("createOrder retorna 201 con orderId y tenant tbb", async ({ request }) => {
    const res = await request.post("createOrder", { data: validOrder });
    expect(res.status(), await res.text()).toBe(201);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.orderId).toBeTruthy();
    expect(body.data.tenantId).toBe(TENANT);
    expect(body.data.displayOrderNumber).toBeGreaterThan(0);
    expect(body.data.displayCode).toMatch(/^\d{3,}$/);
    expect(body.data.operationalDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("createOrder persiste pedido consultable con getOrder", async ({ request }) => {
    const create = await request.post("createOrder", { data: validOrder });
    expect(create.status(), await create.text()).toBe(201);

    const created = await create.json();
    const orderId = created.data.orderId;

    const get = await request.get(`getOrder/${orderId}?tenantId=${TENANT}`);
    expect(get.status(), await get.text()).toBe(200);

    const found = await get.json();
    expect(found.ok).toBe(true);
    expect(found.data.status).toBe("queued");
    expect(found.data.items.length).toBeGreaterThan(0);
    expect(found.data.totals.total).toBeGreaterThan(0);
    expect(found.data.displayOrderNumber).toBeGreaterThan(0);
    expect(found.data.displayCode).toMatch(/^\d{3,}$/);
    expect(found.data.operationalDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("createPosSale retorna 201 para venta POS", async ({ request }) => {
    const res = await request.post("createPosSale", { data: validPosSale });
    expect(res.status(), await res.text()).toBe(201);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.orderId).toBeTruthy();
    expect(body.data.tenantId).toBe(TENANT);
    expect(body.data.displayCode).toMatch(/^\d{3,}$/);
  });

  test("createPosSale delivery cobra fee y persiste en getOrder", async ({ request }) => {
    const res = await request.post("createPosSale", {
      data: {
        ...validPosSale,
        fulfillmentType: "delivery",
        customer: {
          ...validPosSale.customer,
          address: "Av. Brasil 1234",
        },
      },
    });
    expect(res.status(), await res.text()).toBe(201);

    const body = await res.json();
    expect(body.ok).toBe(true);
    const orderId: string = body.data.orderId;
    expect(orderId).toBeTruthy();

    const get = await request.get(`getOrder/${orderId}?tenantId=${TENANT}`);
    expect(get.status(), await get.text()).toBe(200);

    const found = await get.json();
    expect(found.data.fulfillmentType).toBe("delivery");
    expect(found.data.channel).toBe("admin_pos");
    expect(found.data.totals.delivery).toBe(1500);
    expect(found.data.totals.total).toBe(found.data.totals.subtotal + 1500);
  });

  test("createPosSale sin fulfillmentType persiste pickup y delivery cero", async ({ request }) => {
    const { fulfillmentType: _, ...posSaleWithoutFulfillment } = validPosSale;
    const res = await request.post("createPosSale", { data: posSaleWithoutFulfillment });
    expect(res.status(), await res.text()).toBe(201);

    const body = await res.json();
    expect(body.ok).toBe(true);
    const orderId: string = body.data.orderId;
    expect(orderId).toBeTruthy();

    const get = await request.get(`getOrder/${orderId}?tenantId=${TENANT}`);
    expect(get.status(), await get.text()).toBe(200);

    const found = await get.json();
    expect(found.data.fulfillmentType).toBe("pickup");
    expect(found.data.channel).toBe("admin_pos");
    expect(found.data.totals.delivery).toBe(0);
    expect(found.data.totals.total).toBe(found.data.totals.subtotal);
  });

  test("createPosSale pickup sin telefono persiste venta mostrador y no crea customerId", async ({ request }) => {
    const res = await request.post("createPosSale", {
      data: {
        tenantId: TENANT,
        items: [{ productId: "vader-burger", qty: 1 }],
        customer: { name: "Cliente mostrador" },
        paymentMethod: "cash",
      },
    });
    expect(res.status(), await res.text()).toBe(201);

    const body = await res.json();
    const orderId: string = body.data.orderId;
    expect(body.data.displayCode).toMatch(/^\d{3,}$/);

    const get = await request.get(`getOrder/${orderId}?tenantId=${TENANT}`);
    expect(get.status(), await get.text()).toBe(200);

    const found = await get.json();
    expect(found.data.fulfillmentType).toBe("pickup");
    expect(found.data.customer.name).toBe("Cliente mostrador");
    expect(found.data.customer.phone ?? "").toBe("");
    expect(found.data.customerId).toBeUndefined();
    expect(found.data.customerPhoneNormalized).toBeUndefined();
  });

  test("createOrder con items vacíos retorna 400", async ({ request }) => {
    const res = await request.post("createOrder", {
      data: { ...validOrder, items: [] },
    });

    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  test("createOrder con GET retorna 405", async ({ request }) => {
    const res = await request.get("createOrder");
    expect(res.status()).toBe(405);
  });
});
