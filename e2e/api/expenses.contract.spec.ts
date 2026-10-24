import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  bearer,
  createFixtureTenant,
  createMembership,
  createUser,
  revokeMembership,
  type TestUser,
} from "../support/emulator-fixtures";

/**
 * Capa 1 — Contrato de la API de expenses contra Firebase Emulator.
 *
 * Pre-req: `npm run dev:emulators` corriendo con Auth + Firestore + Functions.
 *
 * SEC-BASE: la autorización verifica membresía activa en el tenant. Las rutas
 * admin requieren tenantId explícito y rechazan el claim legacy `admin:true`.
 * No hay getExpense: la lectura es admin-only; verificamos el round-trip
 * leyendo el documento con el token `owner` del emulador.
 */

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? "minerp-sentinel";
const FIRESTORE_DOCS = `http://127.0.0.1:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const OWNER_HEADERS = { Authorization: "Bearer owner" };

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
  let tenantId: string;
  let owner: TestUser;
  let nonMember: TestUser;
  let revokedMember: TestUser;
  let legacyClaimOnly: TestUser;

  const validExpense = () => ({
    tenantId,
    category: "supplies" as const,
    description: "Caja de tomates",
    amount: 12000,
    paymentMethod: "cash" as const,
  });

  test.beforeAll(async ({ playwright, baseURL }) => {
    api = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { "Content-Type": "application/json" },
    });

    tenantId = await createFixtureTenant(api, "expenses");
    owner = await createUser(api, { label: "expenses-owner" });
    await createMembership(api, { tenantId, uid: owner.uid, role: "owner" });

    nonMember = await createUser(api, { label: "expenses-nomember" });
    revokedMember = await createUser(api, { label: "expenses-revoked" });
    await createMembership(api, { tenantId, uid: revokedMember.uid, role: "admin" });
    await revokeMembership(api, tenantId, revokedMember.uid);

    legacyClaimOnly = await createUser(api, {
      label: "expenses-legacyclaim",
      legacyAdminClaim: true,
    });
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test.describe("autorización (SEC-BASE)", () => {
    test("sin token: 401 y cero escrituras", async () => {
      const before = await listExpenses(api, tenantId);
      const res = await api.post("createExpense", { data: validExpense() });
      expect(res.status(), await res.text()).toBe(401);
      expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
      expect(await listExpenses(api, tenantId)).toHaveLength(before.length);
    });

    test("token inválido: 401 y cero escrituras", async () => {
      const before = await listExpenses(api, tenantId);
      const res = await api.post("createExpense", {
        headers: bearer("not-a-valid-firebase-id-token"),
        data: validExpense(),
      });
      expect(res.status(), await res.text()).toBe(401);
      expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
      expect(await listExpenses(api, tenantId)).toHaveLength(before.length);
    });

    test("usuario autenticado sin membresía: 403 y cero escrituras", async () => {
      const before = await listExpenses(api, tenantId);
      const res = await api.post("createExpense", {
        headers: bearer(nonMember.token),
        data: validExpense(),
      });
      expect(res.status(), await res.text()).toBe(403);
      expect((await res.json()).error.code).toBe("FORBIDDEN");
      expect(await listExpenses(api, tenantId)).toHaveLength(before.length);
    });

    test("miembro revocado: 403 y cero escrituras", async () => {
      const before = await listExpenses(api, tenantId);
      const res = await api.post("createExpense", {
        headers: bearer(revokedMember.token),
        data: validExpense(),
      });
      expect(res.status(), await res.text()).toBe(403);
      expect(await listExpenses(api, tenantId)).toHaveLength(before.length);
    });

    test("claim legacy admin:true sin membresía: 403", async () => {
      const before = await listExpenses(api, tenantId);
      const res = await api.post("createExpense", {
        headers: bearer(legacyClaimOnly.token),
        data: validExpense(),
      });
      expect(res.status(), await res.text()).toBe(403);
      expect(await listExpenses(api, tenantId)).toHaveLength(before.length);
    });

    test("owner autorizado: round-trip conserva categoría, importe, método y fecha", async () => {
      const occurredAt = "2026-07-01T14:30:00.000Z";

      const res = await api.post("createExpense", {
        headers: bearer(owner.token),
        data: {
          tenantId,
          category: "fuel",
          description: "Diesel foodtruck",
          amount: 25500,
          paymentMethod: "transfer",
          occurredAt,
        },
      });
      expect(res.status(), await res.text()).toBe(201);
      const { expenseId } = (await res.json()).data;

      const fields = await readExpense(api, tenantId, expenseId);
      expect(fields.category.stringValue).toBe("fuel");
      expect(fields.description.stringValue).toBe("Diesel foodtruck");
      expect(Number(fields.amount.integerValue ?? fields.amount.doubleValue)).toBe(25500);
      expect(fields.paymentMethod.stringValue).toBe("transfer");
      expect(new Date(fields.occurredAt.timestampValue).toISOString()).toBe(occurredAt);
    });

    test("H-01: gasto persistido referencia al UID del actor autenticado", async () => {
      const res = await api.post("createExpense", {
        headers: bearer(owner.token),
        data: validExpense(),
      });
      expect(res.status(), await res.text()).toBe(201);
      const { expenseId } = (await res.json()).data;

      const fields = await readExpense(api, tenantId, expenseId);
      expect(fields.createdByUid?.stringValue).toBe(owner.uid);
      expect(fields.createdByEmail?.stringValue).toBe(owner.email);
    });
  });

  test("createExpense retorna 201 con expenseId y tenant solicitado", async () => {
    const res = await api.post("createExpense", {
      headers: bearer(owner.token),
      data: validExpense(),
    });
    expect(res.status(), await res.text()).toBe(201);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.expenseId).toBeTruthy();
    expect(body.data.tenantId).toBe(tenantId);
  });

  test("createExpense sin tenantId retorna 400 (sin fallback silencioso)", async () => {
    const { tenantId: _, ...payloadWithoutTenant } = validExpense();
    const res = await api.post("createExpense", {
      headers: bearer(owner.token),
      data: payloadWithoutTenant,
    });
    expect(res.status(), await res.text()).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  test("createExpense sin paymentMethod aplica default cash", async () => {
    const { paymentMethod: _, ...expenseWithoutPayment } = validExpense();
    const res = await api.post("createExpense", {
      headers: bearer(owner.token),
      data: expenseWithoutPayment,
    });
    expect(res.status(), await res.text()).toBe(201);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.expenseId).toBeTruthy();
  });

  test("createExpense acepta occurredAt ISO para backdatear", async () => {
    const res = await api.post("createExpense", {
      headers: bearer(owner.token),
      data: { ...validExpense(), occurredAt: "2026-07-01T14:30:00.000Z" },
    });
    expect(res.status(), await res.text()).toBe(201);

    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("createExpense con amount negativo retorna 400", async () => {
    const res = await api.post("createExpense", {
      headers: bearer(owner.token),
      data: { ...validExpense(), amount: -500 },
    });

    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("createExpense con amount cero retorna 400", async () => {
    const res = await api.post("createExpense", {
      headers: bearer(owner.token),
      data: { ...validExpense(), amount: 0 },
    });

    expect(res.status()).toBe(400);
    expect((await res.json()).ok).toBe(false);
  });

  test("createExpense con categoría desconocida retorna 400", async () => {
    const res = await api.post("createExpense", {
      headers: bearer(owner.token),
      data: { ...validExpense(), category: "crypto" },
    });

    expect(res.status()).toBe(400);
    expect((await res.json()).ok).toBe(false);
  });

  test("createExpense con description muy corta retorna 400", async () => {
    const res = await api.post("createExpense", {
      headers: bearer(owner.token),
      data: { ...validExpense(), description: "x" },
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
