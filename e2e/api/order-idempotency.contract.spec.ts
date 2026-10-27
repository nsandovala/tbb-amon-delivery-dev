import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import {
  bearer,
  createFixtureTenant,
  createMembership,
  createOpenFixtureTenant,
  createUser,
  FIRESTORE_DOCS,
  FIXTURE_PRODUCT,
  newIdempotencyKey,
  patchFixtureDoc,
  type TestUser,
} from "../support/emulator-fixtures";

/**
 * ORDER-IDEMPOTENCY v1 — una compra exactamente una vez a nivel de persistencia.
 *
 * Contrato: `idempotencyKey` obligatorio en createOrder/createPosSale.
 * - Primera creación: 201, `replayed: false`.
 * - Reintento con la misma clave y el mismo contenido: 200, `replayed: true`,
 *   mismos identificadores, sin escrituras nuevas (pedido, contador, cliente).
 * - Misma clave, contenido distinto: 409 `IDEMPOTENCY_KEY_REUSED` sin datos.
 * - El reintento se responde aunque después cierre la tienda o la caja.
 * - La clave es por tenant y canal; la autorización del POS no cambia.
 */

let api: APIRequestContext;

async function readDoc(path: string): Promise<Record<string, { integerValue?: string; stringValue?: string }> | null> {
  const res = await api.get(`${FIRESTORE_DOCS}/${path}`, { headers: { Authorization: "Bearer owner" } });
  if (res.status() === 404) return null;
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as { fields?: Record<string, { integerValue?: string }> }).fields ?? {};
}

async function countOrders(tenantId: string): Promise<number> {
  const res = await api.get(`${FIRESTORE_DOCS}/tenants/${tenantId}/orders?pageSize=300`, {
    headers: { Authorization: "Bearer owner" },
  });
  if (res.status() === 404) return 0;
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as { documents?: unknown[] }).documents?.length ?? 0;
}

async function counterValue(tenantId: string, operationalDate: string): Promise<number> {
  const fields = await readDoc(`tenants/${tenantId}/orderCounters/${operationalDate}`);
  return Number(fields?.lastDisplayOrderNumber?.integerValue ?? 0);
}

async function customerTotalOrders(tenantId: string, phone: string): Promise<number> {
  const fields = await readDoc(`tenants/${tenantId}/customers/${encodeURIComponent(phone)}`);
  return Number(fields?.totalOrders?.integerValue ?? 0);
}

function uniquePhone(): string {
  return `+569${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
}

type Created = { orderId: string; displayCode: string; displayOrderNumber: number; operationalDate: string; replayed: boolean };

async function created(res: APIResponse, status: 200 | 201): Promise<Created> {
  expect(res.status(), await res.text()).toBe(status);
  const data = (await res.json()).data as Created;
  expect(data.replayed).toBe(status === 200);
  return data;
}

test.describe.configure({ mode: "serial" });

test.describe("ORDER-IDEMPOTENCY createOrder (web)", () => {
  let tenantId: string;
  let owner: TestUser;

  const webOrder = (key: string, overrides: Record<string, unknown> = {}) => ({
    tenantId,
    items: [{ productId: FIXTURE_PRODUCT.id, qty: 1 }],
    customer: { name: "Cliente Idempotente", phone: "+56911112222" },
    fulfillmentType: "pickup",
    paymentMethod: "cash",
    idempotencyKey: key,
    ...overrides,
  });

  test.beforeAll(async ({ playwright, baseURL }) => {
    api = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { "Content-Type": "application/json" },
    });
    const fixture = await createOpenFixtureTenant(api, "idem-web");
    tenantId = fixture.tenantId;
    owner = fixture.owner;
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test("pedido nuevo: 201 y replayed false", async () => {
    await created(await api.post("createOrder", { data: webOrder(newIdempotencyKey()) }), 201);
  });

  test("misma clave y mismo contenido: 200 con el pedido original, sin escrituras nuevas", async () => {
    const key = newIdempotencyKey();
    const phone = uniquePhone();
    const payload = webOrder(key, { customer: { name: "Cliente Replay", phone } });

    const first = await created(await api.post("createOrder", { data: payload }), 201);
    const ordersAfterFirst = await countOrders(tenantId);
    const counterAfterFirst = await counterValue(tenantId, first.operationalDate);
    expect(counterAfterFirst).toBe(first.displayOrderNumber);
    expect(await customerTotalOrders(tenantId, phone)).toBe(1);

    for (let i = 0; i < 3; i += 1) {
      const retry = await created(await api.post("createOrder", { data: payload }), 200);
      expect(retry).toEqual({ ...first, replayed: true });
    }

    expect(await countOrders(tenantId)).toBe(ordersAfterFirst);
    expect(await counterValue(tenantId, first.operationalDate)).toBe(counterAfterFirst);
    expect(await customerTotalOrders(tenantId, phone)).toBe(1);
  });

  test("respuesta perdida: el reintento recupera el pedido ya creado", async () => {
    const key = newIdempotencyKey();
    const before = await countOrders(tenantId);
    // Primer envío: el cliente "pierde" la respuesta y no la lee.
    await api.post("createOrder", { data: webOrder(key) });
    const retry = await created(await api.post("createOrder", { data: webOrder(key) }), 200);
    expect(retry.orderId).toBeTruthy();
    expect(await countOrders(tenantId)).toBe(before + 1);
  });

  test("misma clave con contenido distinto: 409 sin datos del pedido", async () => {
    const key = newIdempotencyKey();
    await created(await api.post("createOrder", { data: webOrder(key) }), 201);
    const before = await countOrders(tenantId);

    const res = await api.post("createOrder", {
      data: webOrder(key, { items: [{ productId: FIXTURE_PRODUCT.id, qty: 2 }] }),
    });
    expect(res.status(), await res.text()).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    const text = JSON.stringify(body);
    expect(text).not.toContain("Cliente Idempotente");
    expect(text).not.toContain("911112222");
    expect(body.data).toBeUndefined();
    expect(await countOrders(tenantId)).toBe(before);
  });

  test("solicitudes concurrentes con la misma clave: un solo pedido y un solo incremento", async () => {
    const key = newIdempotencyKey();
    const phone = uniquePhone();
    const payload = webOrder(key, { customer: { name: "Cliente Concurrente", phone } });
    const before = await countOrders(tenantId);

    const responses = await Promise.all(
      Array.from({ length: 3 }, () => api.post("createOrder", { data: payload }))
    );
    const statuses = responses.map((res) => res.status()).sort();
    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.filter((status) => status === 200)).toHaveLength(2);

    const bodies = await Promise.all(responses.map(async (res) => (await res.json()).data as Created));
    expect(new Set(bodies.map((body) => body.orderId)).size).toBe(1);
    expect(new Set(bodies.map((body) => body.displayOrderNumber)).size).toBe(1);

    expect(await countOrders(tenantId)).toBe(before + 1);
    expect(await counterValue(tenantId, bodies[0].operationalDate)).toBe(bodies[0].displayOrderNumber);
    expect(await customerTotalOrders(tenantId, phone)).toBe(1);
  });

  test("clave nueva con el mismo carrito: compra nueva permitida", async () => {
    const payload = (key: string) => webOrder(key, { customer: { name: "Cliente Repite", phone: "+56933334444" } });
    const a = await created(await api.post("createOrder", { data: payload(newIdempotencyKey()) }), 201);
    const b = await created(await api.post("createOrder", { data: payload(newIdempotencyKey()) }), 201);
    expect(b.orderId).not.toBe(a.orderId);
    expect(b.displayOrderNumber).toBe(a.displayOrderNumber + 1);
  });

  test("clave ausente o con formato inválido: 400", async () => {
    const { idempotencyKey: _omit, ...withoutKey } = webOrder("x");
    for (const data of [withoutKey, webOrder("corta"), webOrder("con espacios y más de dieciséis"), webOrder("a".repeat(129))]) {
      const res = await api.post("createOrder", { data });
      expect(res.status(), await res.text()).toBe(400);
    }
  });

  test("reintento después del cierre de tienda: 200; un intento nuevo sigue rechazado", async () => {
    const key = newIdempotencyKey();
    const original = await created(await api.post("createOrder", { data: webOrder(key) }), 201);

    const close = await api.post("setStoreOperation", {
      headers: bearer(owner.token),
      data: { tenantId, action: "close", reason: "idempotencia e2e" },
    });
    expect(close.status(), await close.text()).toBe(200);

    const retry = await created(await api.post("createOrder", { data: webOrder(key) }), 200);
    expect(retry.orderId).toBe(original.orderId);

    const fresh = await api.post("createOrder", { data: webOrder(newIdempotencyKey()) });
    expect(fresh.status(), await fresh.text()).toBe(409);
    expect((await fresh.json()).error.code).toBe("STORE_CLOSED");

    const reopen = await api.post("setStoreOperation", {
      headers: bearer(owner.token),
      data: { tenantId, action: "open", reason: "idempotencia e2e" },
    });
    expect(reopen.status(), await reopen.text()).toBe(200);
  });
});

test.describe("ORDER-IDEMPOTENCY tras cierre de caja (fin de la jornada)", () => {
  test("el pedido se recupera con su clave después de cerrar la caja del día", async ({ playwright, baseURL }) => {
    const ctx = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { "Content-Type": "application/json" },
    });
    api = ctx;
    const { tenantId, owner } = await createOpenFixtureTenant(ctx, "idem-cash");
    const key = newIdempotencyKey();
    const payload = {
      tenantId,
      items: [{ productId: FIXTURE_PRODUCT.id, qty: 1 }],
      customer: { name: "Cliente Caja", phone: "+56955556666" },
      fulfillmentType: "pickup",
      paymentMethod: "cash",
      idempotencyKey: key,
    };

    const original = await created(await ctx.post("createOrder", { data: payload }), 201);
    await patchFixtureDoc(ctx, `tenants/${tenantId}/orders/${original.orderId}`, { status: "delivered" });

    const close = await ctx.post("closeCashSession", {
      headers: bearer(owner.token),
      data: {
        tenantId,
        countedCash: FIXTURE_PRODUCT.price,
        transfersConfirmed: 0,
        idempotencyKey: newIdempotencyKey(),
      },
    });
    expect(close.status(), await close.text()).toBe(201);

    const before = await countOrders(tenantId);
    const retry = await created(await ctx.post("createOrder", { data: payload }), 200);
    expect(retry).toEqual({ ...original, replayed: true });
    expect(await countOrders(tenantId)).toBe(before);

    const looked = await ctx.post("lookupOrderAttempt", { data: { tenantId, channel: "web", idempotencyKey: key } });
    expect(looked.status(), await looked.text()).toBe(200);
    expect((await looked.json()).data).toMatchObject({ found: true, orderId: original.orderId });

    const fresh = await ctx.post("createOrder", { data: { ...payload, idempotencyKey: newIdempotencyKey() } });
    expect(fresh.status(), await fresh.text()).toBe(409);
    expect((await fresh.json()).error.code).toBe("STORE_CLOSED");

    await ctx.dispose();
  });
});

test.describe("ORDER-IDEMPOTENCY createPosSale", () => {
  let tenantId: string;
  let owner: TestUser;
  let otherTenantAdmin: TestUser;

  const sale = (key: string, overrides: Record<string, unknown> = {}) => ({
    tenantId,
    items: [{ productId: FIXTURE_PRODUCT.id, qty: 2 }],
    customer: { name: "Mostrador" },
    fulfillmentType: "pickup",
    paymentMethod: "cash",
    idempotencyKey: key,
    ...overrides,
  });

  test.beforeAll(async ({ playwright, baseURL }) => {
    api = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { "Content-Type": "application/json" },
    });
    const fixture = await createOpenFixtureTenant(api, "idem-pos");
    tenantId = fixture.tenantId;
    owner = fixture.owner;

    const otherTenant = await createFixtureTenant(api, "idem-pos-other");
    otherTenantAdmin = await createUser(api, { label: "idem-pos-other-admin" });
    await createMembership(api, { tenantId: otherTenant, uid: otherTenantAdmin.uid, role: "admin" });
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test("venta POS con membresía: 201 y el reintento devuelve la misma venta", async () => {
    const key = newIdempotencyKey();
    const first = await created(
      await api.post("createPosSale", { headers: bearer(owner.token), data: sale(key) }),
      201
    );
    const before = await countOrders(tenantId);
    const retry = await created(
      await api.post("createPosSale", { headers: bearer(owner.token), data: sale(key) }),
      200
    );
    expect(retry).toEqual({ ...first, replayed: true });
    expect(await countOrders(tenantId)).toBe(before);
    expect(await counterValue(tenantId, first.operationalDate)).toBe(first.displayOrderNumber);
  });

  test("POS: misma clave con otro detalle → 409", async () => {
    const key = newIdempotencyKey();
    await created(await api.post("createPosSale", { headers: bearer(owner.token), data: sale(key) }), 201);
    const res = await api.post("createPosSale", {
      headers: bearer(owner.token),
      data: sale(key, { paymentMethod: "transfer" }),
    });
    expect(res.status(), await res.text()).toBe(409);
    expect((await res.json()).error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  test("POS sin token y miembro de otro tenant siguen rechazados aunque la clave exista", async () => {
    const key = newIdempotencyKey();
    await created(await api.post("createPosSale", { headers: bearer(owner.token), data: sale(key) }), 201);

    const anon = await api.post("createPosSale", { data: sale(key) });
    expect(anon.status(), await anon.text()).toBe(401);

    const foreign = await api.post("createPosSale", {
      headers: bearer(otherTenantAdmin.token),
      data: sale(key),
    });
    expect(foreign.status(), await foreign.text()).toBe(403);
    const foreignText = await foreign.text();
    expect(foreignText).not.toContain("orderId");
  });

  test("la clave es por canal: la misma clave en web y POS crea pedidos distintos", async () => {
    const key = newIdempotencyKey();
    const pos = await created(await api.post("createPosSale", { headers: bearer(owner.token), data: sale(key) }), 201);
    const web = await created(
      await api.post("createOrder", {
        data: {
          tenantId,
          items: [{ productId: FIXTURE_PRODUCT.id, qty: 2 }],
          customer: { name: "Mostrador", phone: "+56977778888" },
          fulfillmentType: "pickup",
          paymentMethod: "cash",
          idempotencyKey: key,
        },
      }),
      201
    );
    expect(web.orderId).not.toBe(pos.orderId);
  });
});

test.describe("ORDER-IDEMPOTENCY lookupOrderAttempt (recuperación sin crear)", () => {
  let tenantId: string;
  let owner: TestUser;
  let otherTenant: string;
  let otherTenantAdmin: TestUser;

  const webOrder = (key: string, qty = 1) => ({
    tenantId,
    items: [{ productId: FIXTURE_PRODUCT.id, qty }],
    customer: { name: "Cliente Recupera", phone: "+56922223333", address: "Calle Privada 77" },
    fulfillmentType: "pickup",
    paymentMethod: "cash",
    idempotencyKey: key,
  });
  const lookup = (key: string, channel: "web" | "admin_pos" = "web", headers: Record<string, string> = {}, tenant = tenantId) =>
    api.post("lookupOrderAttempt", { headers, data: { tenantId: tenant, channel, idempotencyKey: key } });

  async function lookupData(res: APIResponse) {
    expect(res.status(), await res.text()).toBe(200);
    return (await res.json()).data as { found: boolean } & Partial<Created>;
  }

  test.beforeAll(async ({ playwright, baseURL }) => {
    api = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { "Content-Type": "application/json" },
    });
    const fixture = await createOpenFixtureTenant(api, "idem-lookup");
    tenantId = fixture.tenantId;
    owner = fixture.owner;
    otherTenant = await createFixtureTenant(api, "idem-lookup-other");
    otherTenantAdmin = await createUser(api, { label: "idem-lookup-other-admin" });
    await createMembership(api, { tenantId: otherTenant, uid: otherTenantAdmin.uid, role: "admin" });
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test("intento inexistente: found false y no crea nada", async () => {
    const before = await countOrders(tenantId);
    const data = await lookupData(await lookup(newIdempotencyKey()));
    expect(data).toEqual({ found: false });
    expect(await countOrders(tenantId)).toBe(before);
  });

  test("respuesta perdida + recarga (web, nivel API): la verificación recupera el pedido sin datos personales", async () => {
    const key = newIdempotencyKey();
    const original = await created(await api.post("createOrder", { data: webOrder(key) }), 201);
    const before = await countOrders(tenantId);

    const res = await lookup(key);
    const text = await res.text();
    const data = await lookupData(res);
    expect(data).toEqual({
      found: true,
      orderId: original.orderId,
      displayOrderNumber: original.displayOrderNumber,
      displayCode: original.displayCode,
      operationalDate: original.operationalDate,
    });
    for (const pii of ["Cliente Recupera", "922223333", "Calle Privada", "customer", "items"]) {
      expect(text).not.toContain(pii);
    }
    expect(await countOrders(tenantId)).toBe(before);
  });

  test("contenido modificado durante un intento incierto: 409 y la verificación muestra el pedido original sin crear otro", async () => {
    const key = newIdempotencyKey();
    const original = await created(await api.post("createOrder", { data: webOrder(key, 1) }), 201);
    const before = await countOrders(tenantId);

    const changed = await api.post("createOrder", { data: webOrder(key, 3) });
    expect(changed.status(), await changed.text()).toBe(409);
    expect((await changed.json()).error.code).toBe("IDEMPOTENCY_KEY_REUSED");

    const data = await lookupData(await lookup(key));
    expect(data.found).toBe(true);
    expect(data.orderId).toBe(original.orderId);
    expect(await countOrders(tenantId)).toBe(before);
  });

  test("separación por canal y tenant", async () => {
    const key = newIdempotencyKey();
    await created(await api.post("createOrder", { data: webOrder(key) }), 201);
    expect(await lookupData(await lookup(key, "admin_pos", bearer(owner.token)))).toEqual({ found: false });
    expect(await lookupData(await lookup(key, "web", {}, otherTenant))).toEqual({ found: false });
  });

  test("POS: verificación exige membresía del tenant", async () => {
    const key = newIdempotencyKey();
    const sale = await created(
      await api.post("createPosSale", {
        headers: bearer(owner.token),
        data: {
          tenantId,
          items: [{ productId: FIXTURE_PRODUCT.id, qty: 1 }],
          customer: { name: "Mostrador" },
          fulfillmentType: "pickup",
          paymentMethod: "cash",
          idempotencyKey: key,
        },
      }),
      201
    );

    const anon = await lookup(key, "admin_pos");
    expect(anon.status(), await anon.text()).toBe(401);
    const foreign = await lookup(key, "admin_pos", bearer(otherTenantAdmin.token));
    expect(foreign.status(), await foreign.text()).toBe(403);
    expect(await foreign.text()).not.toContain(sale.orderId);

    const data = await lookupData(await lookup(key, "admin_pos", bearer(owner.token)));
    expect(data).toMatchObject({ found: true, orderId: sale.orderId });
  });

  test("verificación tras cierre de tienda: sigue encontrando el pedido", async () => {
    const key = newIdempotencyKey();
    const original = await created(await api.post("createOrder", { data: webOrder(key) }), 201);
    const close = await api.post("setStoreOperation", {
      headers: bearer(owner.token),
      data: { tenantId, action: "close", reason: "lookup e2e" },
    });
    expect(close.status(), await close.text()).toBe(200);
    expect(await lookupData(await lookup(key))).toMatchObject({ found: true, orderId: original.orderId });
    const reopen = await api.post("setStoreOperation", {
      headers: bearer(owner.token),
      data: { tenantId, action: "open", reason: "lookup e2e" },
    });
    expect(reopen.status(), await reopen.text()).toBe(200);
  });

  test("O-04 web: found false seguido de creación tardía; la segunda verificación recupera el original", async () => {
    const key = newIdempotencyKey();
    expect(await lookupData(await lookup(key))).toEqual({ found: false });
    // El envío original llega tarde al servidor.
    const late = await created(await api.post("createOrder", { data: webOrder(key) }), 201);
    const again = await lookupData(await lookup(key));
    expect(again).toMatchObject({ found: true, orderId: late.orderId, displayCode: late.displayCode });
    // Reenviar el mismo intento tras recuperarlo no crea otro pedido.
    const replay = await created(await api.post("createOrder", { data: webOrder(key) }), 200);
    expect(replay.orderId).toBe(late.orderId);
  });

  test("O-04 POS: found false seguido de venta tardía; la segunda verificación la recupera", async () => {
    const key = newIdempotencyKey();
    const sale = {
      tenantId,
      items: [{ productId: FIXTURE_PRODUCT.id, qty: 1 }],
      customer: { name: "Mostrador" },
      fulfillmentType: "pickup",
      paymentMethod: "cash",
      idempotencyKey: key,
    };
    expect(await lookupData(await lookup(key, "admin_pos", bearer(owner.token)))).toEqual({ found: false });
    const late = await created(await api.post("createPosSale", { headers: bearer(owner.token), data: sale }), 201);
    expect(await lookupData(await lookup(key, "admin_pos", bearer(owner.token)))).toMatchObject({
      found: true,
      orderId: late.orderId,
    });
  });

  test("verificar no mueve contadores ni ventas (web y POS, varias veces)", async () => {
    const webKey = newIdempotencyKey();
    const posKey = newIdempotencyKey();
    const web = await created(await api.post("createOrder", { data: webOrder(webKey) }), 201);
    await created(
      await api.post("createPosSale", {
        headers: bearer(owner.token),
        data: {
          tenantId,
          items: [{ productId: FIXTURE_PRODUCT.id, qty: 1 }],
          customer: { name: "Mostrador" },
          fulfillmentType: "pickup",
          paymentMethod: "cash",
          idempotencyKey: posKey,
        },
      }),
      201
    );
    const orders = await countOrders(tenantId);
    const counter = await counterValue(tenantId, web.operationalDate);

    for (let i = 0; i < 3; i += 1) {
      await lookupData(await lookup(webKey));
      await lookupData(await lookup(posKey, "admin_pos", bearer(owner.token)));
      await lookupData(await lookup(newIdempotencyKey()));
    }

    expect(await countOrders(tenantId)).toBe(orders);
    expect(await counterValue(tenantId, web.operationalDate)).toBe(counter);
  });

  test("entrada inválida: 400; método distinto de POST: 405; sin tenant: 400", async () => {
    expect((await api.post("lookupOrderAttempt", { data: { tenantId, channel: "web", idempotencyKey: "corta" } })).status()).toBe(400);
    expect((await api.post("lookupOrderAttempt", { data: { tenantId, channel: "otro", idempotencyKey: newIdempotencyKey() } })).status()).toBe(400);
    expect((await api.post("lookupOrderAttempt", { data: { channel: "web", idempotencyKey: newIdempotencyKey() } })).status()).toBe(400);
    expect((await api.get("lookupOrderAttempt")).status()).toBe(405);
  });
});
