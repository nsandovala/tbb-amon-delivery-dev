import { test, expect } from "@playwright/test";

/**
 * Capa 1 — Contrato de la API de expenses contra Firebase Emulator.
 *
 * Pre-req:
 * - npm run dev:emulators corriendo
 *
 * No hay getExpense: la lectura es admin-only vía Firestore rules,
 * así que el contrato se verifica sobre la respuesta de createExpense.
 */

const TENANT = "tbb";

const validExpense = {
  tenantId: TENANT,
  category: "supplies" as const,
  description: "Caja de tomates",
  amount: 12000,
  paymentMethod: "cash" as const,
};

test.describe("Expenses API contract emulator", () => {
  test("createExpense retorna 201 con expenseId y tenant tbb", async ({ request }) => {
    const res = await request.post("createExpense", { data: validExpense });
    expect(res.status(), await res.text()).toBe(201);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.expenseId).toBeTruthy();
    expect(body.data.tenantId).toBe(TENANT);
  });

  test("createExpense sin tenantId usa el tenant por defecto", async ({ request }) => {
    const { tenantId: _, ...expenseWithoutTenant } = validExpense;
    const res = await request.post("createExpense", { data: expenseWithoutTenant });
    expect(res.status(), await res.text()).toBe(201);

    const body = await res.json();
    expect(body.data.tenantId).toBe(TENANT);
  });

  test("createExpense sin paymentMethod aplica default cash", async ({ request }) => {
    const { paymentMethod: _, ...expenseWithoutPayment } = validExpense;
    const res = await request.post("createExpense", { data: expenseWithoutPayment });
    expect(res.status(), await res.text()).toBe(201);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.expenseId).toBeTruthy();
  });

  test("createExpense acepta occurredAt ISO para backdatear", async ({ request }) => {
    const res = await request.post("createExpense", {
      data: { ...validExpense, occurredAt: "2026-07-01T14:30:00.000Z" },
    });
    expect(res.status(), await res.text()).toBe(201);

    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("createExpense con amount negativo retorna 400", async ({ request }) => {
    const res = await request.post("createExpense", {
      data: { ...validExpense, amount: -500 },
    });

    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("createExpense con amount cero retorna 400", async ({ request }) => {
    const res = await request.post("createExpense", {
      data: { ...validExpense, amount: 0 },
    });

    expect(res.status()).toBe(400);
    expect((await res.json()).ok).toBe(false);
  });

  test("createExpense con categoría desconocida retorna 400", async ({ request }) => {
    const res = await request.post("createExpense", {
      data: { ...validExpense, category: "crypto" },
    });

    expect(res.status()).toBe(400);
    expect((await res.json()).ok).toBe(false);
  });

  test("createExpense con description muy corta retorna 400", async ({ request }) => {
    const res = await request.post("createExpense", {
      data: { ...validExpense, description: "x" },
    });

    expect(res.status()).toBe(400);
    expect((await res.json()).ok).toBe(false);
  });

  test("createExpense con GET retorna 405", async ({ request }) => {
    const res = await request.get("createExpense");
    expect(res.status()).toBe(405);
  });
});
