import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  bearer,
  createMembership,
  createOpenFixtureTenant,
  createUser,
  newIdempotencyKey,
  writeFixtureDoc,
  FIXTURE_PRODUCT,
} from "../support/emulator-fixtures";
import {
  closeCash,
  commitFixtureDocs,
  confirmTransfer,
  expectCode,
  payKey,
  readCollection,
  readDoc,
  revertTransfer,
  seedOrder,
  shiftDate,
  todayOperationalDate,
} from "../support/fin-01-fixtures";

/**
 * FIN-01 — contrato API de confirmación/reversión de transferencias.
 * Run (emuladores arriba): npx playwright test e2e/api/fin-01-payments.contract.spec.ts
 *
 * Cada describe usa su propio tenant: cerrar caja de hoy cierra la jornada.
 */

test.describe.configure({ mode: "serial" });

let api: APIRequestContext;

test.beforeAll(async ({ playwright, baseURL }) => {
  api = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { "Content-Type": "application/json" },
  });
});

test.afterAll(async () => {
  await api.dispose();
});

async function eventsOf(tenantId: string, orderId?: string) {
  const rows = await readCollection(api, `tenants/${tenantId}/paymentEvents`);
  return orderId ? rows.filter((row) => row.orderId === orderId) : rows;
}

test.describe("confirmar · replay · reversión", () => {
  let tenantId: string;
  let token: string;
  let adminToken: string;
  const today = todayOperationalDate();

  test.beforeAll(async () => {
    const fixture = await createOpenFixtureTenant(api, "fin01-flow");
    tenantId = fixture.tenantId;
    token = fixture.owner.token;
    const admin = await createUser(api, { label: "fin01-admin" });
    await createMembership(api, { tenantId, uid: admin.uid, role: "admin" });
    adminToken = admin.token;
  });

  test("confirmar antes de la entrega: 201, paid, status intacto, evento y contador", async () => {
    const { orderId, total } = await seedOrder(api, tenantId, "fin01queued00000001", { status: "queued" });
    const res = await confirmTransfer(api, adminToken, {
      tenantId, orderId, expectedAmount: total, reference: "op 4821", idempotencyKey: payKey(),
    });
    const body = await expectCode(res, 201);
    expect(body.data).toMatchObject({
      replayed: false,
      action: "transfer_confirmed",
      orderId,
      amount: total,
      effectiveOperationalDate: today,
      currentPaymentStatus: "paid",
      confirmationActive: true,
    });

    const order = await readDoc(api, `tenants/${tenantId}/orders/${orderId}`);
    expect(order?.status).toBe("queued");
    expect(order?.paymentStatus).toBe("paid");
    expect(order?.paymentConfirmation).toMatchObject({
      eventId: body.data.eventId,
      amount: total,
      effectiveOperationalDate: today,
    });
    // Proyección mínima: el actor y la referencia viven solo en el evento.
    expect(order?.paymentConfirmation.reference).toBeUndefined();

    const [event] = await eventsOf(tenantId, orderId);
    expect(event).toMatchObject({
      type: "transfer_confirmed",
      signedAmount: total,
      effectiveOperationalDate: today,
      originOperationalDate: today,
      reference: "op 4821",
      actor: { role: "admin" },
    });
    const counter = await readDoc(api, `tenants/${tenantId}/orderCounters/${today}`);
    expect(counter?.payments).toEqual({ transferEventCount: 1, transferNet: total });
  });

  test("ciclo completo: replay, reutilización, doble confirmación, stale, reversión, clave antigua", async () => {
    const { orderId, total } = await seedOrder(api, tenantId, "fin01cycle00000001");
    const key = payKey();
    const first = await expectCode(
      await confirmTransfer(api, token, { tenantId, orderId, expectedAmount: total, idempotencyKey: key }),
      201
    );
    const confirmationId = first.data.eventId as string;

    // Misma clave y payload: replay sin escrituras.
    const replay = await expectCode(
      await confirmTransfer(api, token, { tenantId, orderId, expectedAmount: total, idempotencyKey: key }),
      200
    );
    expect(replay.data).toMatchObject({ replayed: true, eventId: confirmationId, confirmationActive: true });
    expect(await eventsOf(tenantId, orderId)).toHaveLength(1);

    // Misma clave, otro payload.
    await expectCode(
      await confirmTransfer(api, token, { tenantId, orderId, expectedAmount: total, reference: "otro", idempotencyKey: key }),
      409,
      "IDEMPOTENCY_KEY_REUSED"
    );
    // Clave nueva sobre un pedido ya pagado.
    await expectCode(
      await confirmTransfer(api, token, { tenantId, orderId, expectedAmount: total, idempotencyKey: payKey() }),
      409,
      "PAYMENT_ALREADY_CONFIRMED"
    );
    // Reversión con id de confirmación equivocado.
    await expectCode(
      await revertTransfer(api, token, {
        tenantId, orderId, expectedConfirmationEventId: "noEsLaVigente0000000", reason: "abono no llegó", idempotencyKey: payKey(),
      }),
      409,
      "STALE_CONFIRMATION"
    );

    const revertKey = payKey();
    const reverted = await expectCode(
      await revertTransfer(api, token, {
        tenantId, orderId, expectedConfirmationEventId: confirmationId, reason: "abono no llegó al banco", idempotencyKey: revertKey,
      }),
      201
    );
    expect(reverted.data).toMatchObject({ action: "transfer_confirmation_reverted", currentPaymentStatus: "pending", amount: total });
    const afterRevert = await readDoc(api, `tenants/${tenantId}/orders/${orderId}`);
    expect(afterRevert?.paymentStatus).toBe("pending");
    expect(afterRevert?.paymentConfirmation).toBeNull();
    expect(afterRevert?.lastPaymentReversal).toMatchObject({ eventId: reverted.data.eventId, reversesEventId: confirmationId });

    // Reintentar la reversión: replay.
    await expectCode(
      await revertTransfer(api, token, {
        tenantId, orderId, expectedConfirmationEventId: confirmationId, reason: "abono no llegó al banco", idempotencyKey: revertKey,
      }),
      200
    );
    // Revertir otra vez con clave nueva: ya no hay confirmación vigente.
    await expectCode(
      await revertTransfer(api, token, {
        tenantId, orderId, expectedConfirmationEventId: confirmationId, reason: "otra vez", idempotencyKey: payKey(),
      }),
      409,
      "PAYMENT_NOT_CONFIRMED"
    );

    // Clave antigua de confirmación tras revertir: replay que informa el estado ACTUAL.
    const oldKey = await expectCode(
      await confirmTransfer(api, token, { tenantId, orderId, expectedAmount: total, idempotencyKey: key }),
      200
    );
    expect(oldKey.data).toMatchObject({
      replayed: true,
      eventId: confirmationId,
      confirmationActive: false,
      currentPaymentStatus: "pending",
      activeConfirmationEventId: null,
    });
    expect((await readDoc(api, `tenants/${tenantId}/orders/${orderId}`))?.paymentStatus).toBe("pending");
    expect(await eventsOf(tenantId, orderId)).toHaveLength(2);

    // Clave nueva: reconfirmación legítima.
    const again = await expectCode(
      await confirmTransfer(api, token, { tenantId, orderId, expectedAmount: total, idempotencyKey: payKey() }),
      201
    );
    expect(again.data.eventId).not.toBe(confirmationId);
    const events = await eventsOf(tenantId, orderId);
    expect(events).toHaveLength(3);
    expect(events.reduce((sum, event) => sum + event.signedAmount, 0)).toBe(total);
  });

  test("método no transferencia, cancelado y monto distinto: 409 sin escrituras", async () => {
    for (const method of ["cash", "pending", "card"]) {
      const { orderId, total } = await seedOrder(api, tenantId, `fin01method${method}00000`.slice(0, 20), { paymentMethod: method });
      await expectCode(
        await confirmTransfer(api, token, { tenantId, orderId, expectedAmount: total, idempotencyKey: payKey() }),
        409,
        "PAYMENT_METHOD_NOT_TRANSFER"
      );
    }
    const cancelled = await seedOrder(api, tenantId, "fin01cancelled000001", { status: "cancelled" });
    await expectCode(
      await confirmTransfer(api, token, { tenantId, orderId: cancelled.orderId, expectedAmount: cancelled.total, idempotencyKey: payKey() }),
      409,
      "ORDER_CANCELLED"
    );
    const mismatch = await seedOrder(api, tenantId, "fin01mismatch0000001");
    const before = await readDoc(api, `tenants/${tenantId}/orderCounters/${today}`);
    const res = await expectCode(
      await confirmTransfer(api, token, { tenantId, orderId: mismatch.orderId, expectedAmount: mismatch.total - 1, idempotencyKey: payKey() }),
      409,
      "AMOUNT_MISMATCH"
    );
    expect(res.error.details).toEqual({ expectedAmount: mismatch.total - 1, orderTotal: mismatch.total });
    expect(await eventsOf(tenantId, mismatch.orderId)).toHaveLength(0);
    expect((await readDoc(api, `tenants/${tenantId}/orders/${mismatch.orderId}`))?.paymentStatus).toBe("pending");
    expect(await readDoc(api, `tenants/${tenantId}/orderCounters/${today}`)).toEqual(before);

    await expectCode(
      await confirmTransfer(api, token, { tenantId, orderId: "noExiste000000000001", expectedAmount: 1000, idempotencyKey: payKey() }),
      404
    );
    await expectCode(
      await confirmTransfer(api, token, { tenantId, orderId: mismatch.orderId, expectedAmount: 10.5, idempotencyKey: payKey() }),
      400
    );
  });

  test("confirmar y luego cancelar con caja abierta: reembolso por revisar, cobro vigente", async () => {
    const { orderId, total } = await seedOrder(api, tenantId, "fin01paidcancel00001", { status: "ready" });
    await expectCode(
      await confirmTransfer(api, token, { tenantId, orderId, expectedAmount: total, idempotencyKey: payKey() }),
      201
    );
    const cancel = await api.patch(`updateOrderStatus?orderId=${orderId}&tenantId=${tenantId}`, {
      headers: bearer(token),
      data: { status: "cancelled", tenantId },
    });
    expect(cancel.status(), await cancel.text()).toBe(200);
    const order = await readDoc(api, `tenants/${tenantId}/orders/${orderId}`);
    expect(order?.status).toBe("cancelled");
    expect(order?.paymentStatus).toBe("paid");

    const summary = (await (await api.get(`getCashCloseSummary?tenantId=${tenantId}`, { headers: bearer(token) })).json()).data;
    expect(summary.summarySource).toBe("live");
    expect(summary.summary.cancelledPaidTransfers.count).toBeGreaterThanOrEqual(1);
    expect(summary.summary.transferCollections.confirmed.total).toBeGreaterThanOrEqual(total);
    expect(summary.ledger.consistent).toBe(true);
  });

  test("listPaymentEvents devuelve el historial sin datos de idempotencia", async () => {
    const res = await api.get(`listPaymentEvents?tenantId=${tenantId}&orderId=fin01cycle00000001`, {
      headers: bearer(adminToken),
    });
    const body = await expectCode(res, 200);
    expect(body.data.complete).toBe(true);
    expect(body.data.events.map((e: { type: string }) => e.type)).toEqual([
      "transfer_confirmed",
      "transfer_confirmation_reverted",
      "transfer_confirmed",
    ]);
    expect(body.data.events[0].idempotency).toBeUndefined();
    await expectCode(await api.get(`listPaymentEvents?tenantId=${tenantId}`, { headers: bearer(adminToken) }), 400);
  });

  test("FIN-A03: historial de más de 100 eventos se declara parcial (complete: false)", async () => {
    // Tenant propio: estos eventos sembrados no tienen pedido y romperían la invariante del tenant principal.
    const history = await createOpenFixtureTenant(api, "fin01-history");
    const orderId = "fin01historyLong0001";
    await commitFixtureDocs(
      api,
      Array.from({ length: 101 }, (_, i) => ({
        path: `tenants/${history.tenantId}/paymentEvents/hist${String(i).padStart(16, "0")}`,
        data: {
          tenantId: history.tenantId, orderId, type: i % 2 ? "transfer_confirmation_reverted" : "transfer_confirmed",
          signedAmount: i % 2 ? -100 : 100, effectiveOperationalDate: shiftDate(today, -30), originOperationalDate: shiftDate(today, -30),
        },
      }))
    );
    const res = await expectCode(
      await api.get(`listPaymentEvents?tenantId=${history.tenantId}&orderId=${orderId}`, { headers: bearer(history.owner.token) }),
      200
    );
    expect(res.data.complete).toBe(false);
    expect(res.data.events).toHaveLength(100);
    const exact = await expectCode(
      await api.get(`listPaymentEvents?tenantId=${tenantId}&orderId=fin01cycle00000001`, { headers: bearer(adminToken) }),
      200
    );
    expect(exact.data.complete).toBe(true);
  });

  test("invariante del tenant: Σ eventos = Σ totales de transferencias pagadas; jornada = contador", async () => {
    const events = await eventsOf(tenantId);
    const orders = await readCollection(api, `tenants/${tenantId}/orders`);
    const paidTotal = orders
      .filter((order) => order.paymentMethod === "transfer" && order.paymentStatus === "paid")
      .reduce((sum, order) => sum + order.totals.total, 0);
    expect(events.reduce((sum, event) => sum + event.signedAmount, 0)).toBe(paidTotal);
    const counter = await readDoc(api, `tenants/${tenantId}/orderCounters/${today}`);
    const todayEvents = events.filter((event) => event.effectiveOperationalDate === today);
    expect(counter?.payments).toEqual({
      transferEventCount: todayEvents.length,
      transferNet: todayEvents.reduce((sum, event) => sum + event.signedAmount, 0),
    });
  });
});

test.describe("confirmación tardía y jornadas cerradas", () => {
  let tenantId: string;
  let token: string;
  const today = todayOperationalDate();
  const yesterday = shiftDate(today, -1);
  const closedSnapshot = {
    id: yesterday,
    operationalDate: yesterday,
    status: "closed",
    countedCash: 0,
    transfersConfirmed: 0,
    summary: { operationalDate: yesterday, expectedTransfers: 6500, note: "snapshot v1 congelado" },
  };

  test.beforeAll(async () => {
    const fixture = await createOpenFixtureTenant(api, "fin01-late");
    tenantId = fixture.tenantId;
    token = fixture.owner.token;
    await writeFixtureDoc(api, `tenants/${tenantId}/cashCloses/${yesterday}`, closedSnapshot);
  });

  test("pedido de D−1 (caja cerrada) confirmado hoy: jornada efectiva hoy, snapshot intacto", async () => {
    const { orderId, total } = await seedOrder(api, tenantId, "fin01late0000000001", { operationalDate: yesterday });
    const before = await readDoc(api, `tenants/${tenantId}/cashCloses/${yesterday}`);
    const res = await expectCode(
      await confirmTransfer(api, token, { tenantId, orderId, expectedAmount: total, idempotencyKey: payKey() }),
      201
    );
    expect(res.data.effectiveOperationalDate).toBe(today);
    expect(await readDoc(api, `tenants/${tenantId}/cashCloses/${yesterday}`)).toEqual(before);

    const live = (await (await api.get(`getCashCloseSummary?tenantId=${tenantId}`, { headers: bearer(token) })).json()).data;
    expect(live.summary.transferCollections.late).toEqual({ count: 1, total });
    // La venta pertenece a D−1: no aparece como venta del día de hoy.
    expect(live.summary.transferSales.count).toBe(0);

    const closed = (await (await api.get(`getCashCloseSummary?tenantId=${tenantId}&operationalDate=${yesterday}`, {
      headers: bearer(token),
    })).json()).data;
    expect(closed.summarySource).toBe("snapshot");
    expect(closed.summary).toEqual(closedSnapshot.summary);
  });

  test("reversión hoy de una confirmación imputada a D−1: evento negativo hoy, D−1 intacto", async () => {
    const orderId = "fin01lateRevert00001";
    const total = 4200;
    const priorEventId = "priorEventD100000000";
    await commitFixtureDocs(api, [
      {
        path: `tenants/${tenantId}/orders/${orderId}`,
        data: {
          id: orderId, tenantId, status: "delivered", channel: "admin_pos", paymentMethod: "transfer",
          paymentStatus: "paid", totals: { subtotal: total, delivery: 0, total }, operationalDate: yesterday,
          paymentConfirmation: { eventId: priorEventId, amount: total, effectiveOperationalDate: yesterday },
        },
      },
      {
        path: `tenants/${tenantId}/paymentEvents/${priorEventId}`,
        data: {
          id: priorEventId, tenantId, orderId, type: "transfer_confirmed", signedAmount: total,
          effectiveOperationalDate: yesterday, originOperationalDate: yesterday,
        },
      },
    ]);
    const before = await readDoc(api, `tenants/${tenantId}/cashCloses/${yesterday}`);
    const res = await expectCode(
      await revertTransfer(api, token, {
        tenantId, orderId, expectedConfirmationEventId: priorEventId, reason: "abono duplicado en banco", idempotencyKey: payKey(),
      }),
      201
    );
    expect(res.data.effectiveOperationalDate).toBe(today);
    const [reversal] = (await eventsOf(tenantId, orderId)).filter((e) => e.type === "transfer_confirmation_reverted");
    expect(reversal).toMatchObject({ signedAmount: -total, effectiveOperationalDate: today, reversesEventId: priorEventId });
    expect(await readDoc(api, `tenants/${tenantId}/cashCloses/${yesterday}`)).toEqual(before);
    const live = (await (await api.get(`getCashCloseSummary?tenantId=${tenantId}`, { headers: bearer(token) })).json()).data;
    expect(live.summary.transferCollections.reverted).toEqual({ count: 1, total });
  });

  test("cancelar un pedido pagado de una jornada cerrada sigue bloqueado (409)", async () => {
    const cancel = await api.patch(`updateOrderStatus?orderId=fin01late0000000001&tenantId=${tenantId}`, {
      headers: bearer(token),
      data: { status: "cancelled", tenantId },
    });
    expect(cancel.status(), await cancel.text()).toBe(409);
  });
});

test.describe("FIN-Q02 · orderCounters/{D} sin documento previo y correlativo intacto", () => {
  test("la confirmación crea el contador; la venta siguiente arranca en #001", async () => {
    const { tenantId, owner } = await createOpenFixtureTenant(api, "fin01-counter-new");
    const today = todayOperationalDate();
    const { orderId, total } = await seedOrder(api, tenantId, "fin01counterNew00001", { operationalDate: shiftDate(today, -1) });
    expect(await readDoc(api, `tenants/${tenantId}/orderCounters/${today}`)).toBeNull();

    await expectCode(
      await confirmTransfer(api, owner.token, { tenantId, orderId, expectedAmount: total, idempotencyKey: payKey() }),
      201
    );
    const created = await readDoc(api, `tenants/${tenantId}/orderCounters/${today}`);
    expect(created?.payments).toEqual({ transferEventCount: 1, transferNet: total });
    expect(created?.lastDisplayOrderNumber).toBeUndefined();

    const sale = await api.post("createPosSale", {
      headers: bearer(owner.token),
      data: {
        tenantId,
        items: [{ productId: FIXTURE_PRODUCT.id, qty: 1 }],
        customer: { name: "Mostrador" },
        paymentMethod: "cash",
        idempotencyKey: newIdempotencyKey(),
      },
    });
    const saleBody = await expectCode(sale, 201);
    expect(saleBody.data.displayOrderNumber).toBe(1);
    const after = await readDoc(api, `tenants/${tenantId}/orderCounters/${today}`);
    expect(after?.lastDisplayOrderNumber).toBe(1);
    expect(after?.payments).toEqual({ transferEventCount: 1, transferNet: total });
  });

  test("con contador existente: la confirmación no toca lastDisplayOrderNumber", async () => {
    const { tenantId, owner } = await createOpenFixtureTenant(api, "fin01-counter-existing");
    const today = todayOperationalDate();
    const sale = (body: Record<string, unknown>) =>
      api.post("createPosSale", {
        headers: bearer(owner.token),
        data: {
          tenantId,
          items: [{ productId: FIXTURE_PRODUCT.id, qty: 1 }],
          customer: { name: "Mostrador" },
          idempotencyKey: newIdempotencyKey(),
          ...body,
        },
      });
    const first = await expectCode(await sale({ paymentMethod: "transfer" }), 201);
    expect(first.data.displayOrderNumber).toBe(1);
    await expectCode(
      await confirmTransfer(api, owner.token, {
        tenantId, orderId: first.data.orderId, expectedAmount: FIXTURE_PRODUCT.price, idempotencyKey: payKey(),
      }),
      201
    );
    const counter = await readDoc(api, `tenants/${tenantId}/orderCounters/${today}`);
    expect(counter?.lastDisplayOrderNumber).toBe(1);
    expect(counter?.payments).toEqual({ transferEventCount: 1, transferNet: FIXTURE_PRODUCT.price });
    const second = await expectCode(await sale({ paymentMethod: "cash" }), 201);
    expect(second.data.displayOrderNumber).toBe(2);
  });

  test("ORDER-IDEMPOTENCY: replay de creación tras confirmar devuelve el mismo pedido sin 409", async () => {
    const { tenantId, owner } = await createOpenFixtureTenant(api, "fin01-replay-create");
    const body = {
      tenantId,
      items: [{ productId: FIXTURE_PRODUCT.id, qty: 1 }],
      customer: { name: "Mostrador" },
      paymentMethod: "transfer",
      idempotencyKey: newIdempotencyKey(),
    };
    const created = await expectCode(await api.post("createPosSale", { headers: bearer(owner.token), data: body }), 201);
    await expectCode(
      await confirmTransfer(api, owner.token, {
        tenantId, orderId: created.data.orderId, expectedAmount: FIXTURE_PRODUCT.price, idempotencyKey: payKey(),
      }),
      201
    );
    const replay = await expectCode(await api.post("createPosSale", { headers: bearer(owner.token), data: body }), 200);
    expect(replay.data).toMatchObject({ orderId: created.data.orderId, replayed: true });
    expect((await readDoc(api, `tenants/${tenantId}/orders/${created.data.orderId}`))?.paymentStatus).toBe("paid");
  });
});

test.describe("cierre de caja v2", () => {
  test("blocker UNCONFIRMED_TRANSFERS, override auditado, snapshot y CASH_DAY_CLOSED", async () => {
    const { tenantId, owner } = await createOpenFixtureTenant(api, "fin01-close");
    const today = todayOperationalDate();
    const confirmed = await seedOrder(api, tenantId, "fin01closeConfirmed1", { total: 7000 });
    const pending = await seedOrder(api, tenantId, "fin01closePending001", { total: 4500 });
    await expectCode(
      await confirmTransfer(api, owner.token, { tenantId, orderId: confirmed.orderId, expectedAmount: 7000, idempotencyKey: payKey() }),
      201
    );

    const blocked = await expectCode(await closeCash(api, owner.token, tenantId, { override: undefined }), 409, "CASH_CLOSE_BLOCKED");
    expect(blocked.error.details.blockers.map((b: { code: string }) => b.code)).toEqual(["UNCONFIRMED_TRANSFERS"]);

    const closed = await expectCode(
      await closeCash(api, owner.token, tenantId, { transfersConfirmed: 7000, override: { reason: "4500 llega mañana" } }),
      201
    );
    expect(closed.data.close).toMatchObject({
      summaryVersion: 2,
      systemConfirmedTransfers: 7000,
      collectionDifference: 0,
      expectedTransfers: 11500,
      transferDifference: 7000 - 11500,
      ledgerCounter: { transferEventCount: 1, transferNet: 7000 },
    });
    expect(closed.data.close.override.blockers[0]).toMatchObject({
      code: "UNCONFIRMED_TRANSFERS",
      orderIds: [pending.orderId],
    });

    const snapshot = (await (await api.get(`getCashCloseSummary?tenantId=${tenantId}`, { headers: bearer(owner.token) })).json()).data;
    expect(snapshot.summarySource).toBe("snapshot");
    expect(snapshot.summary.transferCollections.net).toBe(7000);

    await expectCode(
      await confirmTransfer(api, owner.token, { tenantId, orderId: pending.orderId, expectedAmount: 4500, idempotencyKey: payKey() }),
      409,
      "CASH_DAY_CLOSED"
    );
    expect((await readDoc(api, `tenants/${tenantId}/cashCloses/${today}`))?.systemConfirmedTransfers).toBe(7000);
  });

  test("contador distinto del libro: CASH_CLOSE_INCONSISTENT sin escribir", async () => {
    const { tenantId, owner } = await createOpenFixtureTenant(api, "fin01-inconsistent");
    const today = todayOperationalDate();
    const order = await seedOrder(api, tenantId, "fin01inconsistent001");
    await expectCode(
      await confirmTransfer(api, owner.token, { tenantId, orderId: order.orderId, expectedAmount: order.total, idempotencyKey: payKey() }),
      201
    );
    await writeFixtureDoc(api, `tenants/${tenantId}/orderCounters/${today}`, {
      tenantId, operationalDate: today, payments: { transferEventCount: 1, transferNet: order.total + 1 },
    });
    const summary = (await (await api.get(`getCashCloseSummary?tenantId=${tenantId}`, { headers: bearer(owner.token) })).json()).data;
    expect(summary.ledger.consistent).toBe(false);
    await expectCode(await closeCash(api, owner.token, tenantId), 409, "CASH_CLOSE_INCONSISTENT");
    expect(await readDoc(api, `tenants/${tenantId}/cashCloses/${today}`)).toBeNull();
  });

  test("FIN-Q01: más de 500 eventos en la jornada: PAYMENT_EVENTS_LIMIT y resumen incompleto", async () => {
    const { tenantId, owner } = await createOpenFixtureTenant(api, "fin01-limit");
    const today = todayOperationalDate();
    const docs: { path: string; data: Record<string, unknown> }[] = Array.from({ length: 501 }, (_, i) => ({
      path: `tenants/${tenantId}/paymentEvents/limit${String(i).padStart(15, "0")}`,
      data: { tenantId, orderId: `o${i}`, type: "transfer_confirmed", signedAmount: 100, effectiveOperationalDate: today, originOperationalDate: today },
    }));
    docs.push({
      path: `tenants/${tenantId}/orderCounters/${today}`,
      data: { tenantId, operationalDate: today, payments: { transferEventCount: 501, transferNet: 50100 } },
    });
    await commitFixtureDocs(api, docs);

    const summary = (await (await api.get(`getCashCloseSummary?tenantId=${tenantId}`, { headers: bearer(owner.token) })).json()).data;
    expect(summary.summary.transferCollections.complete).toBe(false);
    expect(summary.ledger.consistent).toBe(false);
    const res = await expectCode(await closeCash(api, owner.token, tenantId), 409, "PAYMENT_EVENTS_LIMIT");
    expect(res.error.details).toEqual({ limit: 500 });
    expect(await readDoc(api, `tenants/${tenantId}/cashCloses/${today}`)).toBeNull();
  });
});
