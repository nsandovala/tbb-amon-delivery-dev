import { test, expect, type APIRequestContext } from "@playwright/test";
import { bearer, createOpenFixtureTenant, writeFixtureDoc } from "../support/emulator-fixtures";
import {
  closeCash,
  confirmTransfer,
  expectCode,
  payKey,
  readCollection,
  readDoc,
  seedOrder,
  todayOperationalDate,
} from "../support/fin-01-fixtures";

/**
 * FIN-01 correcciones de QA (FIN-CLOSE-01/02, FIN-DATA-01, D3) contra emuladores.
 * Run (emuladores arriba): npx playwright test e2e/api/fin-01-corrections.contract.spec.ts
 *
 * Cada test usa su propio tenant: cerrar caja de hoy cierra la jornada.
 */

test.describe.configure({ mode: "serial" });

let api: APIRequestContext;

test.beforeAll(async ({ playwright, baseURL }) => {
  api = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { "Content-Type": "application/json" } });
});

test.afterAll(async () => {
  await api.dispose();
});

async function summaryOf(tenantId: string, token: string) {
  const res = await api.get(`getCashCloseSummary?tenantId=${tenantId}`, { headers: bearer(token) });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()).data;
}

test.describe("FIN-CLOSE-01 · diferencias con motivo", () => {
  test("R1: sin diferencias cierra sin motivo y registra modo manual", async () => {
    const { tenantId, owner } = await createOpenFixtureTenant(api, "fin01c-zero");
    const closed = await expectCode(await closeCash(api, owner.token, tenantId, { override: undefined }), 201);
    expect(closed.data.close).toMatchObject({
      cashDifference: 0,
      collectionDifference: 0,
      discrepancy: null,
      transfersEntryMode: "manual",
      ledgerSuggestion: null,
    });
  });

  test("R2/R3: conciliación ≠ 0 exige motivo; con motivo y cifras vigentes cierra y audita", async () => {
    const { tenantId, owner } = await createOpenFixtureTenant(api, "fin01c-collection");
    const today = todayOperationalDate();
    const order = await seedOrder(api, tenantId, "fin01cCollection0001", { total: 7000 });
    await expectCode(
      await confirmTransfer(api, owner.token, { tenantId, orderId: order.orderId, expectedAmount: 7000, idempotencyKey: payKey() }),
      201
    );

    const missing = await expectCode(
      await closeCash(api, owner.token, tenantId, { transfersConfirmed: 6500, override: undefined }),
      422,
      "CASH_DIFFERENCE_REASON_REQUIRED"
    );
    expect(missing.error.details).toMatchObject({
      transfersConfirmed: 6500,
      systemConfirmedTransfers: 7000,
      collectionDifference: -500,
      cashDifference: 0,
    });
    expect(await readDoc(api, `tenants/${tenantId}/cashCloses/${today}`)).toBeNull();

    // Motivo demasiado corto o sin aceptación: 400 de schema, sin escritura.
    await expectCode(
      await closeCash(api, owner.token, tenantId, {
        transfersConfirmed: 6500,
        override: undefined,
        discrepancy: { reason: "corto", acknowledged: true, cashDifference: 0, collectionDifference: -500 },
      }),
      400
    );
    await expectCode(
      await closeCash(api, owner.token, tenantId, {
        transfersConfirmed: 6500,
        override: undefined,
        discrepancy: { reason: "Comisión bancaria descontada", acknowledged: false, cashDifference: 0, collectionDifference: -500 },
      }),
      400
    );

    const discrepancy = { reason: "Comisión bancaria descontada", acknowledged: true, cashDifference: 0, collectionDifference: -500 };
    const closed = await expectCode(
      await closeCash(api, owner.token, tenantId, { transfersConfirmed: 6500, override: undefined, discrepancy }),
      201
    );
    expect(closed.data.close.discrepancy).toMatchObject({ ...discrepancy, actor: { uid: owner.uid } });

    const events = await readCollection(api, `tenants/${tenantId}/storeEvents`);
    const cashClosed = events.find((event) => event.type === "cash_closed");
    expect(cashClosed?.reason).toBe("Comisión bancaria descontada");
    expect(cashClosed?.metadata).toMatchObject({
      collectionDifference: -500,
      hasDiscrepancy: true,
      discrepancyReason: "Comisión bancaria descontada",
      transfersEntryMode: "manual",
    });
  });

  test("R5: el replay de la misma clave devuelve el cierre original sin revalidar", async () => {
    const { tenantId, owner } = await createOpenFixtureTenant(api, "fin01c-replay");
    const idempotencyKey = `fin01c-replay-${Date.now()}`;
    const discrepancy = { reason: "Fondo inicial no descontado", acknowledged: true, cashDifference: 23000, collectionDifference: 0 };
    await expectCode(
      await closeCash(api, owner.token, tenantId, { countedCash: 23000, override: undefined, discrepancy, idempotencyKey }),
      201
    );
    const replay = await expectCode(
      await closeCash(api, owner.token, tenantId, { countedCash: 1, override: undefined, idempotencyKey }),
      200
    );
    expect(replay.data.replayed).toBe(true);
    expect(replay.data.close.discrepancy.reason).toBe("Fondo inicial no descontado");
    await expectCode(
      await closeCash(api, owner.token, tenantId, { countedCash: 23000, override: undefined, discrepancy }),
      409,
      "CASH_ALREADY_CLOSED"
    );
  });

  test("cierres concurrentes con diferencia justificada: uno cierra, el otro CASH_ALREADY_CLOSED", async () => {
    const { tenantId, owner } = await createOpenFixtureTenant(api, "fin01c-race");
    const today = todayOperationalDate();
    const discrepancy = { reason: "Fondo inicial no descontado", acknowledged: true, cashDifference: 23000, collectionDifference: 0 };
    const results = await Promise.all([
      closeCash(api, owner.token, tenantId, { countedCash: 23000, override: undefined, discrepancy }),
      closeCash(api, owner.token, tenantId, { countedCash: 23000, override: undefined, discrepancy }),
    ]);
    const statuses = results.map((res) => res.status()).sort();
    expect(statuses).toEqual([201, 409]);
    const loser = results.find((res) => res.status() === 409)!;
    await expectCode(loser, 409, "CASH_ALREADY_CLOSED");
    expect((await readDoc(api, `tenants/${tenantId}/cashCloses/${today}`))?.discrepancy?.cashDifference).toBe(23000);
  });
});

test.describe("D3 · sugerencia desde el libro de pagos", () => {
  test("R14: ledger_suggestion vigente cierra y persiste procedencia y aceptación", async () => {
    const { tenantId, owner } = await createOpenFixtureTenant(api, "fin01c-suggest");
    const order = await seedOrder(api, tenantId, "fin01cSuggest0000001", { total: 4200 });
    await expectCode(
      await confirmTransfer(api, owner.token, { tenantId, orderId: order.orderId, expectedAmount: 4200, idempotencyKey: payKey() }),
      201
    );
    const closed = await expectCode(
      await closeCash(api, owner.token, tenantId, {
        override: undefined,
        transfersConfirmed: 4200,
        transfersEntryMode: "ledger_suggestion",
        ledgerSuggestion: { suggestedAmount: 4200, bankVerified: true },
      }),
      201
    );
    expect(closed.data.close).toMatchObject({
      transfersEntryMode: "ledger_suggestion",
      ledgerSuggestion: { suggestedAmount: 4200, bankVerified: true, actor: { uid: owner.uid } },
      collectionDifference: 0,
      discrepancy: null,
    });
  });

  test("sugerencia desactualizada: 409 con el neto real y sin escritura", async () => {
    const { tenantId, owner } = await createOpenFixtureTenant(api, "fin01c-suggest-stale");
    const today = todayOperationalDate();
    const first = await seedOrder(api, tenantId, "fin01cSuggestStale01", { total: 4200 });
    const second = await seedOrder(api, tenantId, "fin01cSuggestStale02", { total: 1800 });
    for (const order of [first, second]) {
      await expectCode(
        await confirmTransfer(api, owner.token, { tenantId, orderId: order.orderId, expectedAmount: order.total, idempotencyKey: payKey() }),
        201
      );
    }
    const stale = await expectCode(
      await closeCash(api, owner.token, tenantId, {
        override: undefined,
        transfersConfirmed: 4200,
        transfersEntryMode: "ledger_suggestion",
        ledgerSuggestion: { suggestedAmount: 4200, bankVerified: true },
      }),
      409,
      "CASH_CLOSE_LEDGER_SUGGESTION_STALE"
    );
    expect(stale.error.details).toMatchObject({ systemConfirmedTransfers: 6000, suggestedAmount: 4200 });
    expect(await readDoc(api, `tenants/${tenantId}/cashCloses/${today}`)).toBeNull();

    // Sin bankVerified o con importe editado: 400 de schema.
    await expectCode(
      await closeCash(api, owner.token, tenantId, {
        override: undefined,
        transfersConfirmed: 6000,
        transfersEntryMode: "ledger_suggestion",
        ledgerSuggestion: { suggestedAmount: 6000, bankVerified: false },
      }),
      400
    );
    await expectCode(
      await closeCash(api, owner.token, tenantId, {
        override: undefined,
        transfersConfirmed: 5999,
        transfersEntryMode: "ledger_suggestion",
        ledgerSuggestion: { suggestedAmount: 6000, bankVerified: true },
      }),
      400
    );
  });
});

test.describe("FIN-DATA-01 · pedidos sin operationalDate", () => {
  test("R6: confirmación de pedido legacy queda como origen desconocido; el caso del QA ya no es ambiguo", async () => {
    const { tenantId, owner } = await createOpenFixtureTenant(api, "fin01c-legacy");
    const today = todayOperationalDate();
    const legacy = await seedOrder(api, tenantId, "fin01cLegacyNoDate01", {
      total: 10990,
      status: "preparing",
      operationalDate: null,
    });
    expect((await readDoc(api, `tenants/${tenantId}/orders/${legacy.orderId}`))?.operationalDate).toBeUndefined();

    const confirmed = await expectCode(
      await confirmTransfer(api, owner.token, { tenantId, orderId: legacy.orderId, expectedAmount: 10990, idempotencyKey: payKey() }),
      201
    );
    const event = await readDoc(api, `tenants/${tenantId}/paymentEvents/${confirmed.data.eventId}`);
    // No se inventa fecha: el origen queda explícitamente desconocido.
    expect(event?.originOperationalDate).toBeNull();
    expect(event?.effectiveOperationalDate).toBe(today);

    const live = await summaryOf(tenantId, owner.token);
    expect(live.summary.transferCollections).toMatchObject({
      confirmed: { count: 0, total: 0 },
      late: { count: 0, total: 0 },
      unknownOrigin: { count: 1, total: 10990 },
      net: 10990,
    });
    expect(live.ledger.consistent).toBe(true);
    // Riesgo documentado: el pedido legacy no entra a la consulta por jornada.
    expect(live.summary.ordersCount).toBe(0);

    const closed = await expectCode(
      await closeCash(api, owner.token, tenantId, { transfersConfirmed: 10990, override: undefined }),
      201
    );
    expect(closed.data.close).toMatchObject({
      expectedTransfers: 0,
      transferDifference: 10990,
      collectionDifference: 0,
      discrepancy: null,
    });
    expect(closed.data.close.summary.transferCollections.unknownOrigin).toEqual({ count: 1, total: 10990 });
  });
});

test.describe("compatibilidad de snapshots", () => {
  test("R9: cierres v1 y v2 previos se informan tal cual, sin campos nuevos inventados", async () => {
    const { tenantId, owner } = await createOpenFixtureTenant(api, "fin01c-snapshot");
    const today = todayOperationalDate();
    const legacyV2 = {
      id: today,
      operationalDate: today,
      status: "closed",
      countedCash: 0,
      transfersConfirmed: 10990,
      expectedCash: 0,
      expectedTransfers: 0,
      cashDifference: 0,
      transferDifference: 10990,
      collectionDifference: 0,
      systemConfirmedTransfers: 10990,
      summaryVersion: 2,
      observation: null,
      override: null,
      summary: {
        summaryVersion: 2,
        operationalDate: today,
        transferCollections: {
          confirmed: { count: 1, total: 10990 },
          late: { count: 0, total: 0 },
          reverted: { count: 0, total: 0 },
          net: 10990,
          eventCount: 1,
          complete: true,
        },
      },
      closedBy: { uid: "qa", email: null },
      closedAtLocal: `${today}T23:00:00-03:00`,
    };
    await writeFixtureDoc(api, `tenants/${tenantId}/cashCloses/${today}`, legacyV2);
    const before = await readDoc(api, `tenants/${tenantId}/cashCloses/${today}`);

    const data = await summaryOf(tenantId, owner.token);
    expect(data.summarySource).toBe("snapshot");
    expect(data.close.discrepancy).toBeUndefined();
    expect(data.close.transfersEntryMode).toBeUndefined();
    expect(data.summary.transferCollections.unknownOrigin).toBeUndefined();
    expect(data.close.transferDifference).toBe(10990);
    // Leer no reescribe el documento histórico.
    expect(await readDoc(api, `tenants/${tenantId}/cashCloses/${today}`)).toEqual(before);
  });
});
