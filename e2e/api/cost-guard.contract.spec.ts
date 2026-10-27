import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  bearer,
  createFixtureTenant,
  createOpenFixtureTenant,
  FIRESTORE_DOCS,
  FIXTURE_PRODUCT,
  writeFixtureDoc,
} from "../support/emulator-fixtures";

/**
 * COST-GUARD v1 — límites de entrada y rechazo temprano en createOrder/createPosSale.
 *
 * Límites (apps/functions/src/schemas/order-limits.ts): 25 líneas, 50 unidades
 * por línea, 200 unidades totales, cuerpo ≤ 16 KB, IDs de documento seguros y
 * largos máximos de los campos del cliente.
 *
 * El orden de validación se prueba "desde afuera": un producto inexistente
 * solo produce error de producto si el flujo llegó a leer productos. Si la
 * respuesta es otra (teléfono inválido, tienda cerrada, límite excedido), el
 * flujo se detuvo antes de esa lectura.
 */

const INACTIVE_PRODUCT_ID = "e2e-inactiva";
const MISSING_PRODUCT_ID = "e2e-no-existe";

let api: APIRequestContext;
let OPEN_TENANT = "";
let CLOSED_TENANT = "";
let OWNER_TOKEN = "";

const order = (tenantId: string, overrides: Record<string, unknown> = {}) => ({
  tenantId,
  items: [{ productId: FIXTURE_PRODUCT.id, qty: 1 }],
  customer: { name: "Cost Guard", phone: "+56912345678" },
  fulfillmentType: "pickup",
  paymentMethod: "cash",
  ...overrides,
});

const lines = (count: number, qty = 1, productId = FIXTURE_PRODUCT.id) =>
  Array.from({ length: count }, () => ({ productId, qty }));

async function countOrders(tenantId: string): Promise<number> {
  const res = await api.get(`${FIRESTORE_DOCS}/tenants/${tenantId}/orders?pageSize=300`, {
    headers: { Authorization: "Bearer owner" },
  });
  if (res.status() === 404) return 0;
  expect(res.status(), await res.text()).toBe(200);
  const body = (await res.json()) as { documents?: unknown[] };
  return body.documents?.length ?? 0;
}

async function expectValidation(res: Awaited<ReturnType<APIRequestContext["post"]>>) {
  expect(res.status(), await res.text()).toBe(400);
  expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ playwright, baseURL }) => {
  api = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { "Content-Type": "application/json" },
  });
  const open = await createOpenFixtureTenant(api, "cost-guard");
  OPEN_TENANT = open.tenantId;
  OWNER_TOKEN = open.owner.token;
  await writeFixtureDoc(api, `tenants/${OPEN_TENANT}/products/${INACTIVE_PRODUCT_ID}`, {
    id: INACTIVE_PRODUCT_ID,
    name: "Producto desactivado",
    price: 5000,
    isActive: false,
    tenantId: OPEN_TENANT,
  });
  // Sin horario configurado: fail-closed.
  CLOSED_TENANT = await createFixtureTenant(api, "cost-guard-closed");
});

test.afterAll(async () => {
  await api.dispose();
});

test.describe("COST-GUARD createOrder", () => {
  test("pedido web normal sigue funcionando (201)", async () => {
    const res = await api.post("createOrder", { data: order(OPEN_TENANT) });
    expect(res.status(), await res.text()).toBe(201);
  });

  test("pedido en el límite (25 líneas, 200 unidades) se acepta", async () => {
    const items = [...lines(24, 8), { productId: FIXTURE_PRODUCT.id, qty: 8 }];
    const res = await api.post("createOrder", { data: order(OPEN_TENANT, { items }) });
    expect(res.status(), await res.text()).toBe(201);
    const created = await api.get(`getOrder/${(await res.json()).data.orderId}?tenantId=${OPEN_TENANT}`, {
      headers: bearer(OWNER_TOKEN),
    });
    expect(created.status(), await created.text()).toBe(200);
    expect((await created.json()).data.totals.subtotal).toBe(FIXTURE_PRODUCT.price * 200);
  });

  test("más de 25 líneas: 400", async () => {
    await expectValidation(await api.post("createOrder", { data: order(OPEN_TENANT, { items: lines(26) }) }));
  });

  test("más de 50 unidades en una línea: 400", async () => {
    await expectValidation(
      await api.post("createOrder", {
        data: order(OPEN_TENANT, { items: [{ productId: FIXTURE_PRODUCT.id, qty: 51 }] }),
      })
    );
  });

  test("más de 200 unidades en total: 400", async () => {
    await expectValidation(await api.post("createOrder", { data: order(OPEN_TENANT, { items: lines(5, 50) }) }));
  });

  test("cantidades no enteras, cero o negativas: 400", async () => {
    for (const qty of [0, -1, 1.5]) {
      await expectValidation(
        await api.post("createOrder", {
          data: order(OPEN_TENANT, { items: [{ productId: FIXTURE_PRODUCT.id, qty }] }),
        })
      );
    }
  });

  test("productId o tenantId con formato inseguro: 400", async () => {
    for (const productId of ["a/b", "con.punto", "x".repeat(129)]) {
      await expectValidation(
        await api.post("createOrder", { data: order(OPEN_TENANT, { items: [{ productId, qty: 1 }] }) })
      );
    }
    await expectValidation(await api.post("createOrder", { data: order("tenant/ajeno") }));
  });

  test("campos del cliente demasiado largos: 400", async () => {
    const customers = [
      { name: "N".repeat(101), phone: "+56912345678" },
      { name: "Cost Guard", phone: "9".repeat(33) },
      { name: "Cost Guard", phone: "+56912345678", notes: "n".repeat(501) },
      { name: "Cost Guard", phone: "+56912345678", address: "a".repeat(301) },
    ];
    for (const customer of customers) {
      await expectValidation(await api.post("createOrder", { data: order(OPEN_TENANT, { customer }) }));
    }
  });

  test("cuerpo mayor a 16 KB: 413 sin crear pedido", async () => {
    const before = await countOrders(OPEN_TENANT);
    const res = await api.post("createOrder", {
      data: order(OPEN_TENANT, { padding: "x".repeat(20 * 1024) }),
    });
    expect(res.status(), await res.text()).toBe(413);
    expect((await res.json()).error.code).toBe("PAYLOAD_TOO_LARGE");
    expect(await countOrders(OPEN_TENANT)).toBe(before);
  });

  test("producto inexistente: 400 (antes 500) sin crear pedido", async () => {
    const before = await countOrders(OPEN_TENANT);
    const res = await api.post("createOrder", {
      data: order(OPEN_TENANT, { items: [{ productId: MISSING_PRODUCT_ID, qty: 1 }] }),
    });
    await expectValidation(res);
    expect(await countOrders(OPEN_TENANT)).toBe(before);
  });

  test("producto desactivado: 400 sin crear pedido", async () => {
    const before = await countOrders(OPEN_TENANT);
    await expectValidation(
      await api.post("createOrder", {
        data: order(OPEN_TENANT, { items: [{ productId: INACTIVE_PRODUCT_ID, qty: 1 }] }),
      })
    );
    expect(await countOrders(OPEN_TENANT)).toBe(before);
  });

  test("teléfono inválido se rechaza antes de leer productos", async () => {
    const res = await api.post("createOrder", {
      data: order(OPEN_TENANT, {
        items: [{ productId: MISSING_PRODUCT_ID, qty: 1 }],
        customer: { name: "Cost Guard", phone: "123" },
      }),
    });
    await expectValidation(res);
    // Si hubiera leído productos, el error sería el del producto inexistente.
    expect((await res.json()).error.message).toContain("teléfono");
  });

  test("tienda cerrada: 409 antes de leer productos y sin crear pedido", async () => {
    const res = await api.post("createOrder", {
      data: order(CLOSED_TENANT, { items: [{ productId: MISSING_PRODUCT_ID, qty: 1 }] }),
    });
    expect(res.status(), await res.text()).toBe(409);
    // Con producto inexistente: si hubiera leído productos, sería 400.
    expect((await res.json()).error.code).toBe("STORE_CLOSED");
    expect(await countOrders(CLOSED_TENANT)).toBe(0);
  });

  test("tenant inexistente: 409 fail-closed sin crear documentos", async () => {
    const ghost = `e2e-ghost-${Date.now().toString(36)}`;
    const res = await api.post("createOrder", { data: order(ghost) });
    expect(res.status(), await res.text()).toBe(409);
    expect(await countOrders(ghost)).toBe(0);
  });
});

test.describe("COST-GUARD createPosSale", () => {
  const sale = (overrides: Record<string, unknown> = {}) => ({
    tenantId: OPEN_TENANT,
    items: [{ productId: FIXTURE_PRODUCT.id, qty: 1 }],
    customer: { name: "Cost Guard POS" },
    fulfillmentType: "pickup",
    paymentMethod: "cash",
    ...overrides,
  });

  test("venta POS normal sigue funcionando (201)", async () => {
    const res = await api.post("createPosSale", { headers: bearer(OWNER_TOKEN), data: sale() });
    expect(res.status(), await res.text()).toBe(201);
  });

  test("POS con líneas repetidas del mismo producto suma bien (201)", async () => {
    const res = await api.post("createPosSale", {
      headers: bearer(OWNER_TOKEN),
      data: sale({ items: lines(3, 2) }),
    });
    expect(res.status(), await res.text()).toBe(201);
    const created = await api.get(`getOrder/${(await res.json()).data.orderId}?tenantId=${OPEN_TENANT}`, {
      headers: bearer(OWNER_TOKEN),
    });
    expect((await created.json()).data.totals.subtotal).toBe(FIXTURE_PRODUCT.price * 6);
  });

  test("POS aplica los mismos límites: 26 líneas → 400", async () => {
    await expectValidation(
      await api.post("createPosSale", { headers: bearer(OWNER_TOKEN), data: sale({ items: lines(26) }) })
    );
  });

  test("POS con producto inexistente: 400 (antes 500)", async () => {
    await expectValidation(
      await api.post("createPosSale", {
        headers: bearer(OWNER_TOKEN),
        data: sale({ items: [{ productId: MISSING_PRODUCT_ID, qty: 1 }] }),
      })
    );
  });

  test("POS sin token sigue respondiendo 401 aunque el carrito sea excesivo", async () => {
    const res = await api.post("createPosSale", { data: sale({ items: lines(26) }) });
    expect(res.status(), await res.text()).toBe(401);
  });
});
