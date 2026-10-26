import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import {
  bearer,
  createFixtureTenant,
  createMembership,
  createOpenFixtureTenant,
  createUser,
  FIXTURE_PRODUCT,
  revokeMembership,
  type TestUser,
} from "../support/emulator-fixtures";

/**
 * SEC-04 — Lectura privada de pedidos (`getOrder`).
 *
 * El pedido contiene datos personales del cliente. Verificamos que:
 * - Sin token o con token inválido: 401.
 * - Autenticado sin membresía, miembro de otro tenant, miembro revocado o
 *   claim legacy `admin:true`: 403.
 * - Owner y admin del tenant: 200 con los datos que usa el recibo POS.
 * - Pedido inexistente: 404 solo para un usuario ya autorizado.
 * - Ningún rechazo filtra datos personales ni distingue si el pedido existe.
 * - Método, ID y tenant inválidos se rechazan antes de autenticar.
 */

const CUSTOMER = {
  name: "Cliente Privado SEC04",
  phone: "+56987654321",
  address: "Calle Secreta 4040",
};
const PII = [CUSTOMER.name, CUSTOMER.phone, "987654321", CUSTOMER.address];
const MISSING_ORDER_ID = "sec04-no-existe";

test.describe.configure({ mode: "serial" });

test.describe("SEC-04 getOrder lectura privada", () => {
  let api: APIRequestContext;
  let tenantA: string;
  let tenantB: string;
  let ownerA: TestUser;
  let adminA: TestUser;
  let adminB: TestUser;
  let unaffiliated: TestUser;
  let revoked: TestUser;
  let legacyClaim: TestUser;
  let orderId: string;

  const getOrder = (id: string, tenantId: string, headers: Record<string, string> = {}) =>
    api.get(`getOrder/${id}?tenantId=${tenantId}`, { headers });

  async function expectNoPii(res: APIResponse): Promise<string> {
    const text = await res.text();
    for (const value of PII) {
      expect(text, `la respuesta ${res.status()} filtra "${value}"`).not.toContain(value);
    }
    return text;
  }

  test.beforeAll(async ({ playwright, baseURL }) => {
    api = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { "Content-Type": "application/json" },
    });

    const fixture = await createOpenFixtureTenant(api, "sec04-A");
    tenantA = fixture.tenantId;
    ownerA = fixture.owner;

    adminA = await createUser(api, { label: "sec04-adminA" });
    await createMembership(api, { tenantId: tenantA, uid: adminA.uid, role: "admin" });

    tenantB = await createFixtureTenant(api, "sec04-B");
    adminB = await createUser(api, { label: "sec04-adminB" });
    await createMembership(api, { tenantId: tenantB, uid: adminB.uid, role: "admin" });

    unaffiliated = await createUser(api, { label: "sec04-unaffiliated" });

    revoked = await createUser(api, { label: "sec04-revoked" });
    await createMembership(api, { tenantId: tenantA, uid: revoked.uid, role: "admin" });
    await revokeMembership(api, tenantA, revoked.uid);

    legacyClaim = await createUser(api, { label: "sec04-legacy", legacyAdminClaim: true });

    const created = await api.post("createPosSale", {
      headers: bearer(ownerA.token),
      data: {
        tenantId: tenantA,
        items: [{ productId: FIXTURE_PRODUCT.id, qty: 2 }],
        customer: CUSTOMER,
        fulfillmentType: "delivery",
        paymentMethod: "cash",
      },
    });
    expect(created.status(), await created.text()).toBe(201);
    orderId = (await created.json()).data.orderId as string;
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test("sin token: 401", async () => {
    const res = await getOrder(orderId, tenantA);
    expect(res.status(), await res.text()).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
    await expectNoPii(res);
  });

  test("token inválido: 401", async () => {
    const res = await getOrder(orderId, tenantA, bearer("token-invalido"));
    expect(res.status(), await res.text()).toBe(401);
    await expectNoPii(res);
  });

  test("header Authorization mal formado: 401", async () => {
    const res = await getOrder(orderId, tenantA, { Authorization: ownerA.token });
    expect(res.status(), await res.text()).toBe(401);
    await expectNoPii(res);
  });

  test("autenticado sin membresía: 403", async () => {
    const res = await getOrder(orderId, tenantA, bearer(unaffiliated.token));
    expect(res.status(), await res.text()).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
    await expectNoPii(res);
  });

  test("miembro de otro tenant: 403 (sin lectura cruzada)", async () => {
    const res = await getOrder(orderId, tenantA, bearer(adminB.token));
    expect(res.status(), await res.text()).toBe(403);
    await expectNoPii(res);
  });

  test("miembro de otro tenant pidiendo el pedido bajo su propio tenant: 404 sin datos", async () => {
    const res = await getOrder(orderId, tenantB, bearer(adminB.token));
    expect(res.status(), await res.text()).toBe(404);
    await expectNoPii(res);
  });

  test("miembro revocado: 403", async () => {
    const res = await getOrder(orderId, tenantA, bearer(revoked.token));
    expect(res.status(), await res.text()).toBe(403);
    await expectNoPii(res);
  });

  test("claim legacy admin:true sin membresía: 403", async () => {
    const res = await getOrder(orderId, tenantA, bearer(legacyClaim.token));
    expect(res.status(), await res.text()).toBe(403);
    await expectNoPii(res);
  });

  test("owner autorizado: 200 con los datos del recibo POS", async () => {
    const res = await getOrder(orderId, tenantA, bearer(ownerA.token));
    expect(res.status(), await res.text()).toBe(200);
    const order = (await res.json()).data;
    expect(order.id).toBe(orderId);
    expect(order.tenantId).toBe(tenantA);
    expect(order.channel).toBe("admin_pos");
    expect(order.displayCode).toMatch(/^\d{3,}$/);
    expect(order.paymentMethod).toBe("cash");
    expect(order.fulfillmentType).toBe("delivery");
    expect(order.items).toHaveLength(1);
    expect(order.items[0].qty).toBe(2);
    expect(order.totals).toEqual({
      subtotal: FIXTURE_PRODUCT.price * 2,
      delivery: 1500,
      total: FIXTURE_PRODUCT.price * 2 + 1500,
    });
    expect(order.customer.name).toBe(CUSTOMER.name);
  });

  test("admin autorizado del mismo tenant: 200", async () => {
    const res = await getOrder(orderId, tenantA, bearer(adminA.token));
    expect(res.status(), await res.text()).toBe(200);
    expect((await res.json()).data.id).toBe(orderId);
  });

  test("pedido inexistente: 404 para usuario autorizado", async () => {
    const res = await getOrder(MISSING_ORDER_ID, tenantA, bearer(ownerA.token));
    expect(res.status(), await res.text()).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });

  test("no autorizado no distingue pedido existente de inexistente", async () => {
    for (const headers of [{}, bearer(unaffiliated.token), bearer(adminB.token)]) {
      const existing = await getOrder(orderId, tenantA, headers);
      const missing = await getOrder(MISSING_ORDER_ID, tenantA, headers);
      expect(missing.status()).toBe(existing.status());
      expect((await missing.json()).error.code).toBe((await existing.json()).error.code);
    }
  });

  test("método distinto de GET: 405", async () => {
    const res = await api.post(`getOrder/${orderId}?tenantId=${tenantA}`, {
      headers: bearer(ownerA.token),
      data: {},
    });
    expect(res.status(), await res.text()).toBe(405);
    await expectNoPii(res);
  });

  test("sin tenant explícito: 400 (sin fallback al pilot)", async () => {
    const res = await api.get(`getOrder/${orderId}`, { headers: bearer(ownerA.token) });
    expect(res.status(), await res.text()).toBe(400);
    await expectNoPii(res);
  });

  test("orderId inválido o ausente: 400", async () => {
    // Sin `..`: el cliente HTTP normaliza esa ruta antes de enviarla.
    for (const badId of ["con.punto", "id%2Fcon%2Fbarras", "a".repeat(129)]) {
      const res = await getOrder(badId, tenantA, bearer(ownerA.token));
      expect(res.status(), `${badId}: ${await res.text()}`).toBe(400);
    }
    const missing = await api.get(`getOrder?tenantId=${tenantA}`, { headers: bearer(ownerA.token) });
    expect(missing.status(), await missing.text()).toBe(400);
  });
});
