import { test, expect, type APIRequestContext } from "@playwright/test";
import { bearer, createUserToken, uniqueTenantId } from "../support/emulator-fixtures";

/**
 * Capa 1 — Contrato de la API de expenses contra Firebase Emulator.
 *
 * Pre-req:
 * - npm run dev:emulators corriendo
 *
 * No hay getExpense: la lectura es admin-only vía Firestore rules,
 * así que el contrato se verifica sobre la respuesta de createExpense y, para
 * el round-trip de SEC-01, leyendo el documento directo del emulador.
 */

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? "minerp-sentinel";
const FIRESTORE_DOCS = `http://127.0.0.1:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const OWNER_HEADERS = { Authorization: "Bearer owner" };

// Tenant fixture aislado: la suite no escribe gastos de prueba en `tbb`.
const TENANT = uniqueTenantId("expenses");

const validExpense = {
  tenantId: TENANT,
  category: "supplies" as const,
  description: "Caja de tomates",
  amount: 12000,
  paymentMethod: "cash" as const,
};

type FirestoreDoc = { name: string; fields: Record<string, unknown> };

async function listExpenses(
  request: APIRequestContext,
  tenantId: string
): Promise<FirestoreDoc[]> {
  const res = await request.get(
    `${FIRESTORE_DOCS}/tenants/${tenantId}/expenses`,
    { headers: OWNER_HEADERS }
  );
  expect(res.status(), await res.text()).toBe(200);
  const body = (await res.json()) as { documents?: FirestoreDoc[] };
  return body.documents ?? [];
}

async function readExpense(
  request: APIRequestContext,
  tenantId: string,
  expenseId: string
): Promise<Record<string, Record<string, string>>> {
  const res = await request.get(
    `${FIRESTORE_DOCS}/tenants/${tenantId}/expenses/${expenseId}`,
    { headers: OWNER_HEADERS }
  );
  expect(res.status(), await res.text()).toBe(200);
  const body = (await res.json()) as { fields: Record<string, Record<string, string>> };
  return body.fields;
}

test.describe("Expenses API contract emulator", () => {
  let api: APIRequestContext;
  let adminToken: string;
  let nonAdminToken: string;

  test.beforeAll(async ({ playwright, baseURL }) => {
    api = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { "Content-Type": "application/json" },
    });
    adminToken = (await createUserToken(api, { admin: true, label: "expenses-admin" })).token;
    nonAdminToken = (await createUserToken(api, { admin: false, label: "expenses-staff" })).token;
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test.describe("autorización (SEC-01)", () => {
    test("sin token: 401 y cero escrituras", async () => {
      const tenant = uniqueTenantId("expenses-noauth");
      const res = await api.post("createExpense", {
        data: { ...validExpense, tenantId: tenant },
      });
      expect(res.status(), await res.text()).toBe(401);
      expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
      expect(await listExpenses(api, tenant)).toHaveLength(0);
    });

    test("token inválido: 401 y cero escrituras", async () => {
      const tenant = uniqueTenantId("expenses-badtoken");
      const res = await api.post("createExpense", {
        headers: bearer("not-a-valid-firebase-id-token"),
        data: { ...validExpense, tenantId: tenant },
      });
      expect(res.status(), await res.text()).toBe(401);
      expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
      expect(await listExpenses(api, tenant)).toHaveLength(0);
    });

    test("usuario sin claim admin: 403 y cero escrituras", async () => {
      const tenant = uniqueTenantId("expenses-staff");
      const res = await api.post("createExpense", {
        headers: bearer(nonAdminToken),
        data: { ...validExpense, tenantId: tenant },
      });
      expect(res.status(), await res.text()).toBe(403);
      expect((await res.json()).error.code).toBe("FORBIDDEN");
      expect(await listExpenses(api, tenant)).toHaveLength(0);
    });

    test("admin autorizado: round-trip conserva categoría, importe, método y fecha", async () => {
      const tenant = uniqueTenantId("expenses-roundtrip");
      const occurredAt = "2026-07-01T14:30:00.000Z";

      const res = await api.post("createExpense", {
        headers: bearer(adminToken),
        data: {
          tenantId: tenant,
          category: "fuel",
          description: "Diesel foodtruck",
          amount: 25500,
          paymentMethod: "transfer",
          occurredAt,
        },
      });
      expect(res.status(), await res.text()).toBe(201);
      const { expenseId } = (await res.json()).data;

      const fields = await readExpense(api, tenant, expenseId);
      expect(fields.category.stringValue).toBe("fuel");
      expect(fields.description.stringValue).toBe("Diesel foodtruck");
      expect(Number(fields.amount.integerValue ?? fields.amount.doubleValue)).toBe(25500);
      expect(fields.paymentMethod.stringValue).toBe("transfer");
      // Firestore REST normaliza timestamps (omite ms terminados en 0); comparamos como Date.
      expect(new Date(fields.occurredAt.timestampValue).toISOString()).toBe(occurredAt);
    });
  });

  test("createExpense retorna 201 con expenseId y tenant solicitado", async () => {
    const res = await api.post("createExpense", {
      headers: bearer(adminToken),
      data: validExpense,
    });
    expect(res.status(), await res.text()).toBe(201);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.expenseId).toBeTruthy();
    expect(body.data.tenantId).toBe(TENANT);
  });

  test("createExpense sin tenantId usa el tenant por defecto", async () => {
    const { tenantId: _, ...expenseWithoutTenant } = validExpense;
    const res = await api.post("createExpense", {
      headers: bearer(adminToken),
      data: expenseWithoutTenant,
    });
    expect(res.status(), await res.text()).toBe(201);

    const body = await res.json();
    // Único caso que escribe en el tenant piloto: verifica el default del backend.
    expect(body.data.tenantId).toBe("tbb");
  });

  test("createExpense sin paymentMethod aplica default cash", async () => {
    const { paymentMethod: _, ...expenseWithoutPayment } = validExpense;
    const res = await api.post("createExpense", {
      headers: bearer(adminToken),
      data: expenseWithoutPayment,
    });
    expect(res.status(), await res.text()).toBe(201);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.expenseId).toBeTruthy();
  });

  test("createExpense acepta occurredAt ISO para backdatear", async () => {
    const res = await api.post("createExpense", {
      headers: bearer(adminToken),
      data: { ...validExpense, occurredAt: "2026-07-01T14:30:00.000Z" },
    });
    expect(res.status(), await res.text()).toBe(201);

    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("createExpense con amount negativo retorna 400", async () => {
    const res = await api.post("createExpense", {
      headers: bearer(adminToken),
      data: { ...validExpense, amount: -500 },
    });

    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("createExpense con amount cero retorna 400", async () => {
    const res = await api.post("createExpense", {
      headers: bearer(adminToken),
      data: { ...validExpense, amount: 0 },
    });

    expect(res.status()).toBe(400);
    expect((await res.json()).ok).toBe(false);
  });

  test("createExpense con categoría desconocida retorna 400", async () => {
    const res = await api.post("createExpense", {
      headers: bearer(adminToken),
      data: { ...validExpense, category: "crypto" },
    });

    expect(res.status()).toBe(400);
    expect((await res.json()).ok).toBe(false);
  });

  test("createExpense con description muy corta retorna 400", async () => {
    const res = await api.post("createExpense", {
      headers: bearer(adminToken),
      data: { ...validExpense, description: "x" },
    });

    expect(res.status()).toBe(400);
    expect((await res.json()).ok).toBe(false);
  });

  test("createExpense con GET retorna 405", async () => {
    // El check de método es anterior al auth gate: no requiere token.
    const res = await api.get("createExpense");
    expect(res.status()).toBe(405);
  });
});
