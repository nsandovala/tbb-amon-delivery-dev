import { test, expect, type APIRequestContext } from "@playwright/test";
import { derivePaymentEventId } from "../../apps/functions/src/lib/idempotency";
import {
  FIXTURE_PRODUCT,
  bearer,
  createOpenFixtureTenant,
  newIdempotencyKey,
} from "../support/emulator-fixtures";
import {
  closeCash,
  confirmTransfer,
  expectCode,
  payKey,
  readCollection,
  readDoc,
  revertTransfer,
  seedOrder,
  todayOperationalDate,
} from "../support/fin-01-fixtures";

/**
 * FIN-H01 / FIN-Q02 — concurrencia real contra emuladores.
 *
 * Por iteración, en un tenant nuevo: K confirmaciones + 1 reversión +
 * `closeCashSession` disparados a la vez. Invariantes:
 *   - Todo evento con jornada efectiva D existe en el snapshot del cierre.
 *   - Toda confirmación no contada recibió 409 CASH_DAY_CLOSED y no dejó evento.
 *   - Σ eventos de D = orderCounters/{D}.payments = snapshot (count y neto).
 * Variante: createPosSale concurrente con el cierre (venta en snapshot o 409).
 * FIN-CLOSE-01: si el cierre pierde la carrera recibe 422 con las cifras reales
 * (sin escribir) y se reconfirma con motivo; los invariantes se verifican igual.
 *
 * FIN01_CONCURRENCY_ITERATIONS ajusta las repeticiones (por defecto 30).
 */

const ITERATIONS = Number(process.env.FIN01_CONCURRENCY_ITERATIONS ?? 30);
const K = 4;

test.describe.configure({ mode: "serial" });
test.setTimeout(10 * 60_000);

let api: APIRequestContext;

test.beforeAll(async ({ playwright, baseURL }) => {
  api = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { "Content-Type": "application/json" } });
});

test.afterAll(async () => {
  await api.dispose();
});

test(`confirmaciones + reversión + cierre simultáneos (×${ITERATIONS})`, async () => {
  const outcomes = { confirmCounted: 0, confirmRejected: 0, revertCounted: 0, revertRejected: 0, closeRedeclared: 0 };

  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    const { tenantId, owner } = await createOpenFixtureTenant(api, `fin01-race-${iteration}`);
    const today = todayOperationalDate();

    const seeded = await Promise.all(
      Array.from({ length: K }, (_, i) => seedOrder(api, tenantId, `race${iteration}o${i}`.padEnd(20, "0"), { total: 1000 * (i + 1) }))
    );
    const toRevert = await seedOrder(api, tenantId, `race${iteration}rev`.padEnd(20, "0"), { total: 9000 });
    const prior = await expectCode(
      await confirmTransfer(api, owner.token, { tenantId, orderId: toRevert.orderId, expectedAmount: 9000, idempotencyKey: payKey() }),
      201
    );

    const confirmKeys = seeded.map(() => payKey());
    const revertKey = payKey();
    // El cierre declara el neto vigente al iniciar la carrera (9000). Si otra
    // operación entra antes, el servidor recalcula y exige revisar (FIN-CLOSE-01).
    // Disparo simultáneo, como el baseline: un desfase artificial expone una
    // limitación del emulador ("Transaction is invalid or closed") que también
    // reproduce el backend baseline (ver roadmap/sprint-fin-01.md).
    const [firstCloseRes, revertRes, ...confirmRes] = await Promise.all([
      closeCash(api, owner.token, tenantId, { transfersConfirmed: 9000 }),
      revertTransfer(api, owner.token, {
        tenantId, orderId: toRevert.orderId, expectedConfirmationEventId: prior.data.eventId,
        reason: "carrera de QA", idempotencyKey: revertKey,
      }),
      ...seeded.map((order, i) =>
        confirmTransfer(api, owner.token, { tenantId, orderId: order.orderId, expectedAmount: order.total, idempotencyKey: confirmKeys[i] })
      ),
    ]);

    let closeRes = firstCloseRes;
    // La declaración quedó vieja (422 sin motivo, o 409 stale si la revisión
    // anterior también quedó atrás): nada se escribió. El operador revisa las
    // cifras reales del servidor y vuelve a confirmar con motivo.
    let attempts = 1;
    for (; attempts <= 3 && [409, 422].includes(closeRes.status()); attempts += 1) {
      const body = JSON.parse(await closeRes.text());
      expect(["CASH_DIFFERENCE_REASON_REQUIRED", "CASH_CLOSE_DIFFERENCE_STALE"], `iter ${iteration}`).toContain(body.error?.code);
      expect(await readDoc(api, `tenants/${tenantId}/cashCloses/${today}`), `iter ${iteration} no close on reject`).toBeNull();
      const real = body.error.details;
      closeRes = await closeCash(api, owner.token, tenantId, {
        transfersConfirmed: 9000,
        discrepancy: {
          reason: "Carrera de QA: cobros posteriores a la revisión",
          acknowledged: true,
          cashDifference: real.cashDifference,
          collectionDifference: real.collectionDifference,
        },
      });
      outcomes.closeRedeclared += 1;
    }
    const closeText = await closeRes.text();
    expect(closeRes.status(), `iter ${iteration} attempt ${attempts} close: ${closeText}`).toBe(201);
    const close = await readDoc(api, `tenants/${tenantId}/cashCloses/${today}`);
    expect(close, `iter ${iteration}`).not.toBeNull();

    const events = (await readCollection(api, `tenants/${tenantId}/paymentEvents`)).filter(
      (event) => event.effectiveOperationalDate === today
    );
    const counter = (await readDoc(api, `tenants/${tenantId}/orderCounters/${today}`))?.payments ?? {
      transferEventCount: 0,
      transferNet: 0,
    };
    const ledger = {
      transferEventCount: events.length,
      transferNet: events.reduce((sum, event) => sum + event.signedAmount, 0),
    };
    const snapshot = close!.summary.transferCollections;

    // Sin eventos posteriores al cierre: libro = contador = snapshot.
    expect(counter, `iter ${iteration} counter vs ledger`).toEqual(ledger);
    expect({ transferEventCount: snapshot.eventCount, transferNet: snapshot.net }, `iter ${iteration} snapshot`).toEqual(ledger);
    expect(close!.ledgerCounter).toEqual(ledger);
    expect(close!.systemConfirmedTransfers).toBe(ledger.transferNet);

    for (const [i, res] of confirmRes.entries()) {
      const eventId = derivePaymentEventId(tenantId, seeded[i].orderId, "transfer_confirmed", confirmKeys[i]);
      const stored = events.find((event) => event.__id === eventId);
      if (res.status() === 201) {
        expect(stored, `iter ${iteration} confirm ${i} counted`).toBeDefined();
        outcomes.confirmCounted += 1;
      } else {
        await expectCode(res, 409, "CASH_DAY_CLOSED");
        expect(stored, `iter ${iteration} rejected confirm ${i} left no event`).toBeUndefined();
        expect(await readDoc(api, `tenants/${tenantId}/paymentEvents/${eventId}`)).toBeNull();
        outcomes.confirmRejected += 1;
      }
    }

    const reversalId = derivePaymentEventId(tenantId, toRevert.orderId, "transfer_confirmation_reverted", revertKey);
    if (revertRes.status() === 201) {
      expect(events.find((event) => event.__id === reversalId)).toBeDefined();
      outcomes.revertCounted += 1;
    } else {
      await expectCode(revertRes, 409, "CASH_DAY_CLOSED");
      expect(await readDoc(api, `tenants/${tenantId}/paymentEvents/${reversalId}`)).toBeNull();
      expect((await readDoc(api, `tenants/${tenantId}/orders/${toRevert.orderId}`))?.paymentStatus).toBe("paid");
      outcomes.revertRejected += 1;
    }
  }

  console.log(`[FIN-H01] outcomes ${JSON.stringify(outcomes)}`);
  // Todas las confirmaciones se clasificaron (contada o rechazada); el log deja la distribución como evidencia.
  expect(outcomes.confirmCounted + outcomes.confirmRejected).toBe(ITERATIONS * K);
});

test(`createPosSale concurrente con el cierre (×${Math.max(5, Math.floor(ITERATIONS / 3))})`, async () => {
  const runs = Math.max(5, Math.floor(ITERATIONS / 3));
  const outcomes = { saleCounted: 0, saleRejected: 0 };
  for (let iteration = 0; iteration < runs; iteration += 1) {
    const { tenantId, owner } = await createOpenFixtureTenant(api, `fin01-race-pos-${iteration}`);
    const today = todayOperationalDate();
    const [closeRes, saleRes] = await Promise.all([
      closeCash(api, owner.token, tenantId),
      api.post("createPosSale", {
        headers: bearer(owner.token),
        data: {
          tenantId,
          items: [{ productId: FIXTURE_PRODUCT.id, qty: 1 }],
          customer: { name: "Carrera" },
          paymentMethod: "cash",
          idempotencyKey: newIdempotencyKey(),
        },
      }),
    ]);

    if (closeRes.status() === 409) {
      // La venta ganó y quedó activa: el cierre la vio y la bloqueó (no anulable).
      const body = await expectCode(closeRes, 409, "CASH_CLOSE_BLOCKED");
      expect(saleRes.status()).toBe(201);
      expect(body.error.details.nonOverridableBlockers.map((b: { code: string }) => b.code)).toContain("ACTIVE_POS_SALES");
      outcomes.saleCounted += 1;
      continue;
    }
    expect(closeRes.status(), await closeRes.text()).toBe(201);
    const close = await readDoc(api, `tenants/${tenantId}/cashCloses/${today}`);
    const orders = (await readCollection(api, `tenants/${tenantId}/orders`)).filter((o) => o.operationalDate === today);
    // Si el cierre se confirmó, ninguna venta del día puede faltar en su snapshot.
    expect(close!.summary.ordersCount, `iter ${iteration}`).toBe(orders.length);
    if (saleRes.status() === 201) {
      throw new Error(`iter ${iteration}: sale created but close succeeded without blocking it`);
    }
    expect(saleRes.status()).toBe(409);
    outcomes.saleRejected += 1;
  }
  console.log(`[FIN-H01 POS] outcomes ${JSON.stringify(outcomes)}`);
});
