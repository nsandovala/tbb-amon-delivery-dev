import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  bearer,
  createFixtureTenant,
  createMembership,
  createUser,
  revokeMembership,
  type TestUser,
  newIdempotencyKey,
} from "../support/emulator-fixtures";

/**
 * SEC-BASE — Aislamiento multi-tenant y rechazo del claim legacy.
 *
 * Dos tenants independientes (`A` y `B`). Verificamos que:
 * - Owner/admin de A no pueden operar B.
 * - Admin de B no puede leer datos de A.
 * - Un usuario autenticado sin membresía recibe 403.
 * - Un miembro revocado pierde acceso.
 * - El claim legacy `admin:true` no concede acceso en ningún tenant.
 * - La escritura directa a documentos de `members` desde el cliente queda
 *   bloqueada por Firestore rules.
 * - El storefront público (getStoreStatus) sigue funcionando sin token.
 */

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? "minerp-sentinel";
const FIRESTORE_DOCS = `http://127.0.0.1:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

async function countExpenses(request: APIRequestContext, tenantId: string): Promise<number> {
  const res = await request.get(
    `${FIRESTORE_DOCS}/tenants/${tenantId}/expenses`,
    { headers: { Authorization: "Bearer owner" } }
  );
  if (res.status() === 404) return 0;
  expect(res.status(), await res.text()).toBe(200);
  const body = (await res.json()) as { documents?: unknown[] };
  return body.documents?.length ?? 0;
}

const expense = (tenantId: string) => ({
  tenantId,
  category: "supplies" as const,
  description: "Caja cross-tenant",
  amount: 1000,
  paymentMethod: "cash" as const,
});

test.describe.configure({ mode: "serial" });

test.describe("SEC-BASE multi-tenant authorization", () => {
  let api: APIRequestContext;
  let tenantA: string;
  let tenantB: string;
  let ownerA: TestUser;
  let adminB: TestUser;
  let unaffiliated: TestUser;
  let revoked: TestUser;
  let legacyClaim: TestUser;

  test.beforeAll(async ({ playwright, baseURL }) => {
    api = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { "Content-Type": "application/json" },
    });

    tenantA = await createFixtureTenant(api, "sec-base-A");
    tenantB = await createFixtureTenant(api, "sec-base-B");

    ownerA = await createUser(api, { label: "sec-base-ownerA" });
    await createMembership(api, { tenantId: tenantA, uid: ownerA.uid, role: "owner" });

    adminB = await createUser(api, { label: "sec-base-adminB" });
    await createMembership(api, { tenantId: tenantB, uid: adminB.uid, role: "admin" });

    unaffiliated = await createUser(api, { label: "sec-base-unaffiliated" });

    revoked = await createUser(api, { label: "sec-base-revoked" });
    await createMembership(api, { tenantId: tenantA, uid: revoked.uid, role: "admin" });
    await revokeMembership(api, tenantA, revoked.uid);

    legacyClaim = await createUser(api, {
      label: "sec-base-legacy",
      legacyAdminClaim: true,
    });
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test("owner de A puede crear gastos en A", async () => {
    const before = await countExpenses(api, tenantA);
    const res = await api.post("createExpense", {
      headers: bearer(ownerA.token),
      data: expense(tenantA),
    });
    expect(res.status(), await res.text()).toBe(201);
    expect(await countExpenses(api, tenantA)).toBe(before + 1);
  });

  test("owner de A NO puede crear gastos en B (aislamiento cruzado)", async () => {
    const beforeB = await countExpenses(api, tenantB);
    const res = await api.post("createExpense", {
      headers: bearer(ownerA.token),
      data: expense(tenantB),
    });
    expect(res.status(), await res.text()).toBe(403);
    expect(await countExpenses(api, tenantB)).toBe(beforeB);
  });

  test("admin de B NO puede leer el control de A", async () => {
    const res = await api.get(`getStoreControl?tenantId=${tenantA}`, {
      headers: bearer(adminB.token),
    });
    expect(res.status(), await res.text()).toBe(403);
  });

  test("usuario autenticado sin membresía: 403 en cualquier tenant", async () => {
    for (const tenantId of [tenantA, tenantB]) {
      const res = await api.post("createExpense", {
        headers: bearer(unaffiliated.token),
        data: expense(tenantId),
      });
      expect(res.status(), `${tenantId}: ${await res.text()}`).toBe(403);
    }
  });

  test("miembro revocado: 403 aunque haya tenido rol admin", async () => {
    const res = await api.post("createExpense", {
      headers: bearer(revoked.token),
      data: expense(tenantA),
    });
    expect(res.status(), await res.text()).toBe(403);
  });

  test("claim legacy admin:true sin membresía: 403 (no concede acceso)", async () => {
    for (const tenantId of [tenantA, tenantB]) {
      const res = await api.post("createExpense", {
        headers: bearer(legacyClaim.token),
        data: expense(tenantId),
      });
      expect(res.status(), `${tenantId}: ${await res.text()}`).toBe(403);
    }
  });

  test("tenant inexistente: 403 (no filtra que no existe)", async () => {
    const res = await api.post("createExpense", {
      headers: bearer(ownerA.token),
      data: expense("sec-base-unknown-tenant-xyz"),
    });
    expect(res.status(), await res.text()).toBe(403);
  });

  test("acceso anónimo a operación privada: 401", async () => {
    const res = await api.post("createExpense", { data: expense(tenantA) });
    expect(res.status(), await res.text()).toBe(401);
  });

  test("storefront público sigue respondiendo sin token", async () => {
    const res = await api.get(`getStoreStatus?tenantId=${tenantA}`);
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("getMyMembership informa el rol para el owner y 403 para el no-afiliado", async () => {
    const own = await api.get(`getMyMembership?tenantId=${tenantA}`, {
      headers: bearer(ownerA.token),
    });
    expect(own.status()).toBe(200);
    const body = (await own.json()).data;
    expect(body.role).toBe("owner");
    expect(body.tenantId).toBe(tenantA);
    expect(Array.isArray(body.permissions)).toBe(true);
    expect(body.permissions).toContain("expenses.create");
    expect(body.permissions).toContain("members.manage");

    const foreign = await api.get(`getMyMembership?tenantId=${tenantA}`, {
      headers: bearer(adminB.token),
    });
    expect(foreign.status()).toBe(403);
  });

  test("P1-1: createPosSale exige membresía en el tenant", async () => {
    const salePayload = (tenant: string) => ({
      tenantId: tenant,
      items: [{ productId: "unknown-product", qty: 1 }],
      customer: { name: "Mostrador" },
      fulfillmentType: "pickup" as const,
      paymentMethod: "cash" as const,
      idempotencyKey: newIdempotencyKey(),
    });

    // Anónimo → 401.
    const anon = await api.post("createPosSale", { data: salePayload(tenantA) });
    expect(anon.status()).toBe(401);

    // Autenticado sin membresía → 403.
    const noMember = await api.post("createPosSale", {
      headers: bearer(unaffiliated.token),
      data: salePayload(tenantA),
    });
    expect(noMember.status()).toBe(403);

    // Owner-A intenta operar en tenantB → 403.
    const cross = await api.post("createPosSale", {
      headers: bearer(ownerA.token),
      data: salePayload(tenantB),
    });
    expect(cross.status()).toBe(403);

    // Falta `tenantId` → 400 (no fallback silencioso).
    const noTenant = await api.post("createPosSale", {
      headers: bearer(ownerA.token),
      data: { ...salePayload(tenantA), tenantId: undefined },
    });
    expect(noTenant.status()).toBe(400);
  });

  test("P1-1: updateOrderStatus exige membresía en el tenant", async () => {
    // Anónimo → 401 (antes de validar body/payload).
    const anon = await api.patch(`updateOrderStatus?orderId=xxx&tenantId=${tenantA}`, {
      data: { status: "preparing", tenantId: tenantA },
    });
    expect(anon.status()).toBe(401);

    // Sin tenantId → 400.
    const noTenant = await api.patch("updateOrderStatus?orderId=xxx", {
      headers: bearer(ownerA.token),
      data: { status: "preparing" },
    });
    expect(noTenant.status()).toBe(400);

    // Owner-A intenta mutar un pedido en tenantB → 403 ANTES de buscar la orden.
    const cross = await api.patch(`updateOrderStatus?orderId=xxx&tenantId=${tenantB}`, {
      headers: bearer(ownerA.token),
      data: { status: "preparing", tenantId: tenantB },
    });
    expect(cross.status()).toBe(403);
  });

  test("H-04: listMyMemberships devuelve solo los tenants autorizados por el servidor", async () => {
    // ownerA está en tenantA; no debe aparecer tenantB.
    const resOwner = await api.get("listMyMemberships", {
      headers: bearer(ownerA.token),
    });
    expect(resOwner.status()).toBe(200);
    const ownerData = (await resOwner.json()).data;
    expect(ownerData.uid).toBe(ownerA.uid);
    expect(ownerData.memberships).toHaveLength(1);
    expect(ownerData.memberships[0]).toMatchObject({
      tenantId: tenantA,
      role: "owner",
    });

    // adminB está solo en tenantB.
    const resAdminB = await api.get("listMyMemberships", {
      headers: bearer(adminB.token),
    });
    const adminBData = (await resAdminB.json()).data;
    expect(adminBData.memberships).toHaveLength(1);
    expect(adminBData.memberships[0]).toMatchObject({
      tenantId: tenantB,
      role: "admin",
    });

    // No-afiliado: lista vacía (sin 403).
    const resUnaff = await api.get("listMyMemberships", {
      headers: bearer(unaffiliated.token),
    });
    expect(resUnaff.status()).toBe(200);
    expect((await resUnaff.json()).data.memberships).toHaveLength(0);

    // Miembro revocado: no aparece (status != active).
    const resRevoked = await api.get("listMyMemberships", {
      headers: bearer(revoked.token),
    });
    expect(resRevoked.status()).toBe(200);
    expect((await resRevoked.json()).data.memberships).toHaveLength(0);

    // Sin token: 401.
    const anon = await api.get("listMyMemberships");
    expect(anon.status()).toBe(401);
  });

  test("un no-afiliado NO puede auto-crearse membresía escribiendo el doc", async () => {
    // Firestore rules deben bloquear cualquier escritura a members/* desde
    // cliente (incluso con token válido), para prevenir auto-escalamiento.
    const res = await api.patch(
      `${FIRESTORE_DOCS}/tenants/${tenantA}/members/${unaffiliated.uid}`,
      {
        headers: { Authorization: `Bearer ${unaffiliated.token}` },
        data: {
          fields: {
            uid: { stringValue: unaffiliated.uid },
            tenantId: { stringValue: tenantA },
            role: { stringValue: "owner" },
            status: { stringValue: "active" },
            createdByUid: { stringValue: unaffiliated.uid },
          },
        },
      }
    );
    expect(res.status(), await res.text()).toBe(403);

    // Verifica que el gate operativo siga rechazándolo.
    const check = await api.post("createExpense", {
      headers: bearer(unaffiliated.token),
      data: expense(tenantA),
    });
    expect(check.status()).toBe(403);
  });
});
