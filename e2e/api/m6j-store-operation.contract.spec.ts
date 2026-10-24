import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  bearer,
  createFixtureTenant,
  createMembership,
  createUser,
  FIXTURE_PRODUCT,
  patchFixtureDoc,
  writeFixtureDoc,
} from "../support/emulator-fixtures";

/**
 * M6J — contrato API de horario operativo, apertura/cierre manual y cierre de caja.
 *
 * Pre-req: emuladores Auth + Firestore + Functions corriendo (`npm run dev:emulators`).
 * Usa un tenant fixture aislado por ejecución; no lee ni escribe `tbb`.
 * Los estados se fuerzan con overrides manuales, así el resultado no depende de la hora real.
 */

const LOCAL_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;

test.describe.configure({ mode: "serial" });

test.describe("M6J store operation + cash close (emulator)", () => {
  let api: APIRequestContext;
  let tenantId: string;
  let adminToken: string;
  let adminUid: string;
  let adminEmail: string;
  let nonAdminToken: string;
  let defaultConfig: Record<string, unknown>;
  let activeWebOrderId: string;
  let activePosOrderId: string;

  const webOrder = (paymentMethod = "cash") => ({
    tenantId,
    items: [{ productId: FIXTURE_PRODUCT.id, qty: 1 }],
    customer: { name: "E2E M6J", phone: "+56912345678" },
    fulfillmentType: "pickup",
    paymentMethod,
  });

  const posSale = (paymentMethod = "cash") => ({
    tenantId,
    items: [{ productId: FIXTURE_PRODUCT.id, qty: 2 }],
    customer: { name: "Cliente mostrador" },
    fulfillmentType: "pickup",
    paymentMethod,
  });

  const operate = (action: string, reason?: string) =>
    api.post("setStoreOperation", {
      headers: bearer(adminToken),
      data: { tenantId, action, ...(reason ? { reason } : {}) },
    });

  const status = async () => {
    const res = await api.get(`getStoreStatus?tenantId=${tenantId}`);
    expect(res.status(), await res.text()).toBe(200);
    return (await res.json()).data;
  };

  const control = async () => {
    const res = await api.get(`getStoreControl?tenantId=${tenantId}`, {
      headers: bearer(adminToken),
    });
    expect(res.status(), await res.text()).toBe(200);
    return (await res.json()).data;
  };

  const expectBothChannelsRejected = async (reasonCode: string) => {
    for (const [endpoint, payload] of [
      ["createOrder", webOrder()],
      ["createPosSale", posSale()],
    ] as const) {
      const res = await api.post(endpoint, { data: payload });
      expect(res.status(), `${endpoint}: ${await res.text()}`).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe("STORE_CLOSED");
      expect(body.error.details.reasonCode).toBe(reasonCode);
      expect(body.error.message).toContain("no está recibiendo pedidos");
    }
  };

  test.beforeAll(async ({ playwright, baseURL }) => {
    api = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { "Content-Type": "application/json" },
    });
    tenantId = await createFixtureTenant(api, "m6j");
    const adminUser = await createUser(api, { label: "m6j-admin" });
    await createMembership(api, { tenantId, uid: adminUser.uid, role: "admin" });
    adminToken = adminUser.token;
    adminUid = adminUser.uid;
    adminEmail = adminUser.email;
    nonAdminToken = (await createUser(api, { label: "m6j-staff" })).token;
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test("sin configuración: fail-closed y bloqueo backend de web y POS", async () => {
    const current = await status();
    expect(current.state).toBe("closed");
    expect(current.reasonCode).toBe("CONFIG_MISSING");
    expect(current.acceptingOrders).toBe(false);

    await expectBothChannelsRejected("CONFIG_MISSING");
  });

  test("endpoints de control exigen membresía activa", async () => {
    const anonymous = await api.post("setStoreOperation", { data: { tenantId, action: "open" } });
    expect(anonymous.status()).toBe(401);

    const garbage = await api.post("setStoreOperation", {
      headers: bearer("not-a-token"),
      data: { tenantId, action: "open" },
    });
    expect(garbage.status()).toBe(401);

    const staff = await api.post("setStoreOperation", {
      headers: bearer(nonAdminToken),
      data: { tenantId, action: "open" },
    });
    expect(staff.status()).toBe(403);

    for (const [path, data] of [
      ["updateStoreDateException", { tenantId, exception: { date: "2026-12-25", mode: "closed" } }],
      ["deleteStoreDateException", { tenantId, date: "2026-12-25" }],
    ] as const) {
      expect((await api.post(path, { data })).status()).toBe(401);
      expect((await api.post(path, { headers: bearer(nonAdminToken), data })).status()).toBe(403);
    }

    for (const path of [`getStoreControl?tenantId=${tenantId}`, `getCashCloseSummary?tenantId=${tenantId}`]) {
      expect((await api.get(path)).status()).toBe(401);
    }
  });

  test("configuración inválida persistida: fail-closed y sin apertura manual", async () => {
    const data = await control();
    defaultConfig = data.defaultConfig;
    expect(data.config).toBeNull();

    await writeFixtureDoc(api, `tenants/${tenantId}/settings/storeHours`, {
      timezone: "America/Santiago",
      days: { monday: { enabled: true, open: "22:30", close: "17:30" } },
    });

    const current = await status();
    expect(current.state).toBe("closed");
    expect(current.reasonCode).toBe("CONFIG_INVALID");

    const open = await operate("open", "intento con config rota");
    expect(open.status(), await open.text()).toBe(409);
    expect((await open.json()).error.code).toBe("STORE_CONFIG_INVALID");

    await expectBothChannelsRejected("CONFIG_INVALID");
  });

  test("updateStoreHours rechaza horario inválido con 400", async () => {
    const res = await api.post("updateStoreHours", {
      headers: bearer(adminToken),
      data: {
        tenantId,
        config: {
          ...defaultConfig,
          days: {
            ...(defaultConfig.days as Record<string, unknown>),
            friday: { enabled: true, open: "23:00", close: "02:00" },
          },
        },
      },
    });
    expect(res.status(), await res.text()).toBe(400);
  });

  test("updateStoreHours guarda 17:30–22:30 en America/Santiago y audita", async () => {
    const res = await api.post("updateStoreHours", {
      headers: bearer(adminToken),
      data: { tenantId, config: defaultConfig, reason: "Horario inicial" },
    });
    expect(res.status(), await res.text()).toBe(200);

    const data = await control();
    expect(data.config.timezone).toBe("America/Santiago");
    expect(data.config.days.thursday).toEqual({ enabled: true, open: "17:30", close: "22:30" });
    expect(data.status.configValid).toBe(true);
    expect(["scheduled_open", "scheduled_closed", "closing"]).toContain(data.status.state);

    const event = data.events.find((e: { type: string }) => e.type === "hours_updated");
    expect(event).toMatchObject({ source: "manual", reason: "Horario inicial" });
    expect(event.actor.email).toBe(adminEmail);
    expect(event.metadata.previousConfig.days.monday.open).toBe("22:30");
  });

  test("el estado público es lectura pura y mantiene un timezone soportado", async () => {
    const before = (await control()).events.length;
    const publicStatus = await status();
    expect(publicStatus.timezone).toBe("America/Santiago");
    expect((await control()).events.length).toBe(before);

    const invalidTimezone = await api.post("updateStoreHours", {
      headers: bearer(adminToken),
      data: {
        tenantId,
        config: { ...defaultConfig, timezone: "America/New_York" },
      },
    });
    expect(invalidTimezone.status()).toBe(400);
  });

  test("excepción de fecha queda visible al cliente y bloquea web y POS", async () => {
    const current = await status();
    const date = current.localNow.slice(0, 10);
    const save = await api.post("updateStoreDateException", {
      headers: bearer(adminToken),
      data: { tenantId, exception: { date, mode: "closed", customerMessage: "Cerrado por feriado" } },
    });
    expect(save.status(), await save.text()).toBe(200);
    expect((await save.json()).data.status.reasonCode).toBe("SPECIAL_DATE_CLOSED");

    const publicStatus = await status();
    expect(publicStatus.acceptingOrders).toBe(false);
    expect(publicStatus.reasonCode).toBe("SPECIAL_DATE_CLOSED");
    expect(publicStatus.specialDate).toMatchObject({ date, mode: "closed", customerMessage: "Cerrado por feriado" });
    expect(publicStatus.specialDate).not.toHaveProperty("createdBy");
    expect(publicStatus.upcomingSpecialDates.find((entry: { date: string }) => entry.date === date))
      .toMatchObject({ date, mode: "closed", customerMessage: "Cerrado por feriado" });
    await expectBothChannelsRejected("SPECIAL_DATE_CLOSED");

    const controlData = await control();
    expect(controlData.specialDates.find((entry: { date: string }) => entry.date === date))
      .toMatchObject({ date, mode: "closed", createdBy: { email: adminEmail } });
    expect(controlData.events.some((event: { type: string; metadata?: { date?: string } }) =>
      event.type === "special_date_updated" && event.metadata?.date === date
    )).toBe(true);

    const remove = await api.post("deleteStoreDateException", {
      headers: bearer(adminToken), data: { tenantId, date },
    });
    expect(remove.status(), await remove.text()).toBe(200);
    expect((await status()).specialDate).toBeNull();
  });

  test("el panel administra todas las excepciones futuras, incluso fuera del año y sobre 100", async () => {
    const listingTenantId = await createFixtureTenant(api, "special-date-list");
    await createMembership(api, { tenantId: listingTenantId, uid: adminUid, role: "admin" });
    const initialControl = await api.get(`getStoreControl?tenantId=${listingTenantId}`, {
      headers: bearer(adminToken),
    });
    expect(initialControl.status(), await initialControl.text()).toBe(200);
    const listingDefaultConfig = (await initialControl.json()).data.defaultConfig;
    const hours = await api.post("updateStoreHours", {
      headers: bearer(adminToken),
      data: { tenantId: listingTenantId, config: listingDefaultConfig },
    });
    expect(hours.status(), await hours.text()).toBe(200);

    const today = (await status()).localNow.slice(0, 10);
    const futureDates = Array.from({ length: 101 }, (_, index) => {
      const date = new Date(`${today}T12:00:00.000Z`);
      date.setUTCDate(date.getUTCDate() + 400 + index);
      return date.toISOString().slice(0, 10);
    });
    for (let index = 0; index < 100; index += 10) {
      await Promise.all(futureDates.slice(index, index + 10).map((date) =>
        writeFixtureDoc(api, `tenants/${listingTenantId}/storeExceptions/${date}`, { mode: "closed" })
      ));
    }
    const lastDate = futureDates[100];
    const savedException = await api.post("updateStoreDateException", {
      headers: bearer(adminToken),
      data: { tenantId: listingTenantId, exception: { date: lastDate, mode: "closed" } },
    });
    expect(savedException.status(), await savedException.text()).toBe(200);

    const controlResponse = await api.get(`getStoreControl?tenantId=${listingTenantId}`, {
      headers: bearer(adminToken),
    });
    expect(controlResponse.status(), await controlResponse.text()).toBe(200);
    const listed = (await controlResponse.json()).data.specialDates as Array<{ date: string }>;
    expect(listed).toHaveLength(101);
    expect(listed.map((entry) => entry.date)).toContain(lastDate);
    expect(listed[listed.length - 1]?.date).toBe(lastDate);
  });

  test("cierre anticipado manual bloquea web y POS inmediatamente", async () => {
    const res = await operate("close", "Se acabó el pan");
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()).data;
    expect(body.changed).toBe(true);
    expect(body.status.state).toBe("manual_closed");

    const current = await status();
    expect(current.state).toBe("manual_closed");
    expect(current.source).toBe("manual");
    // El endpoint público no expone actor ni motivo.
    expect(current.override).toEqual({ mode: "closed" });

    await expectBothChannelsRejected("MANUAL_CLOSE");
  });

  test("cierre manual repetido es idempotente y no duplica auditoría", async () => {
    const res = await operate("close", "doble clic");
    expect(res.status()).toBe(200);
    expect((await res.json()).data.changed).toBe(false);

    const closes = (await control()).events.filter((e: { type: string }) => e.type === "store_closed");
    expect(closes).toHaveLength(1);
  });

  test("reapertura manual vuelve a aceptar web y POS", async () => {
    const res = await operate("open", "Llegó el pan");
    expect(res.status(), await res.text()).toBe(200);
    expect((await res.json()).data.status.state).toBe("manual_open");

    const web = await api.post("createOrder", { data: webOrder() });
    expect(web.status(), await web.text()).toBe(201);
    activeWebOrderId = (await web.json()).data.orderId;
    const pos = await api.post("createPosSale", { data: posSale() });
    expect(pos.status(), await pos.text()).toBe(201);
    activePosOrderId = (await pos.json()).data.orderId;

    const reopened = (await control()).events.find((e: { type: string }) => e.type === "store_reopened");
    expect(reopened).toMatchObject({
      source: "manual",
      previousState: "manual_closed",
      newState: "manual_open",
      reason: "Llegó el pan",
    });
    expect(reopened.actor.email).toBe(adminEmail);
    expect(reopened.atLocal).toMatch(LOCAL_ISO);
  });

  test("retomar horario elimina el override y vuelve al estado programado", async () => {
    const res = await operate("resume_schedule");
    expect(res.status(), await res.text()).toBe(200);
    const next = (await res.json()).data.status;
    expect(["scheduled_open", "scheduled_closed", "closing"]).toContain(next.state);
    expect(next.override).toBeNull();

    const resumed = (await control()).events.find((e: { type: string }) => e.type === "schedule_resumed");
    expect(resumed).toMatchObject({ source: "manual", metadata: { action: "resume_schedule" } });

    // Reabrimos manualmente para que el resto de la suite no dependa de la hora real.
    expect((await operate("open", "continuar QA")).status()).toBe(200);
  });

  test.describe("cierre de caja", () => {
    let deliveredSale: { orderId: string; total: number };
    let pendingSaleOrderId: string;
    const idempotencyKey = `m6j-${Date.now()}`;

    test("resumen separa efectivo, pendientes y bloqueos", async () => {
      const cash = await api.post("createPosSale", { data: posSale("cash") });
      expect(cash.status(), await cash.text()).toBe(201);
      const pending = await api.post("createPosSale", { data: posSale("pending") });
      expect(pending.status(), await pending.text()).toBe(201);

      const cashOrderId: string = (await cash.json()).data.orderId;
      pendingSaleOrderId = (await pending.json()).data.orderId;
      deliveredSale = { orderId: cashOrderId, total: FIXTURE_PRODUCT.price * 2 };
      // Fixture: entrega la venta directo en el tenant aislado
      // (updateOrderStatus solo opera sobre el tenant piloto).
      await patchFixtureDoc(api, `tenants/${tenantId}/orders/${cashOrderId}`, {
        status: "delivered",
      });

      const expense = await api.post("createExpense", {
        headers: bearer(adminToken),
        data: {
          tenantId,
          category: "supplies",
          description: "Pan de emergencia",
          amount: 2000,
          paymentMethod: "cash",
        },
      });
      expect(expense.status(), await expense.text()).toBe(201);

      const res = await api.get(`getCashCloseSummary?tenantId=${tenantId}`, {
        headers: bearer(adminToken),
      });
      expect(res.status(), await res.text()).toBe(200);
      const data = (await res.json()).data;

      expect(data.isCurrentOperationalDay).toBe(true);
      expect(data.timezone).toBe("America/Santiago");
      expect(data.window.start).toMatch(/T05:00:00-0[34]:00$/);
      expect(data.close).toBeNull();

      const s = data.summary;
      expect(s.cashSales).toEqual({ count: 1, total: deliveredSale.total });
      expect(s.cashExpenses).toEqual({ count: 1, total: 2000 });
      expect(s.expectedCash).toBe(deliveredSale.total - 2000);
      // La venta pending NO es dinero recibido.
      expect(s.pendingSales.count).toBe(1);
      expect(s.pendingSales.total).toBe(FIXTURE_PRODUCT.price * 2);
      // Todo pedido activo bloquea el cierre para no dejarlo atrapado después.
      expect(s.activeOtherOrders.count).toBe(1);
      expect(s.blockers.map((b: { code: string }) => b.code).sort()).toEqual([
        "ACTIVE_OTHER_ORDERS",
        "ACTIVE_POS_SALES",
        "PENDING_PAYMENTS",
      ]);
    });

    test("sin override no cierra en silencio con ventas activas o pendientes", async () => {
      const res = await api.post("closeCashSession", {
        headers: bearer(adminToken),
        data: { tenantId, countedCash: 0, transfersConfirmed: 0, idempotencyKey },
      });
      expect(res.status(), await res.text()).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe("CASH_CLOSE_BLOCKED");
      expect(body.error.details.blockers.length).toBe(3);
    });

    test("payload inválido y fecha futura retornan 400", async () => {
      const decimal = await api.post("closeCashSession", {
        headers: bearer(adminToken),
        data: { tenantId, countedCash: 1000.5, transfersConfirmed: 0, idempotencyKey },
      });
      expect(decimal.status()).toBe(400);

      const future = await api.post("closeCashSession", {
        headers: bearer(adminToken),
        data: {
          tenantId,
          operationalDate: "2999-01-01",
          countedCash: 0,
          transfersConfirmed: 0,
          idempotencyKey,
        },
      });
      expect(future.status()).toBe(400);

      const impossible = await api.post("closeCashSession", {
        headers: bearer(adminToken),
        data: {
          tenantId,
          operationalDate: "2026-02-30",
          countedCash: 0,
          transfersConfirmed: 0,
          idempotencyKey,
        },
      });
      expect(impossible.status()).toBe(400);
    });

    test("override auditado cierra caja y calcula diferencia", async () => {
      const blockedOverride = await api.post("closeCashSession", {
        headers: bearer(adminToken),
        data: {
          tenantId,
          countedCash: 0,
          transfersConfirmed: 0,
          override: { reason: "Intento controlado con pedidos activos" },
          idempotencyKey: `${idempotencyKey}-active`,
        },
      });
      expect(blockedOverride.status(), await blockedOverride.text()).toBe(409);
      expect((await blockedOverride.json()).error.details.nonOverridableBlockers.length).toBe(2);

      // La prueba del override financiero continúa solo después de terminalizar pedidos.
      for (const orderId of [activeWebOrderId, activePosOrderId, pendingSaleOrderId]) {
        await patchFixtureDoc(api, `tenants/${tenantId}/orders/${orderId}`, { status: "delivered" });
      }

      const expectedCash =
        deliveredSale.total + FIXTURE_PRODUCT.price + FIXTURE_PRODUCT.price * 2 - 2000;
      const res = await api.post("closeCashSession", {
        headers: bearer(adminToken),
        data: {
          tenantId,
          countedCash: expectedCash - 500,
          transfersConfirmed: 0,
          observation: "Faltan 500 en monedas",
          override: { reason: "Venta pendiente se cobra mañana por transferencia" },
          idempotencyKey,
        },
      });
      expect(res.status(), await res.text()).toBe(201);
      const { replayed, close } = (await res.json()).data;

      expect(replayed).toBe(false);
      expect(close.expectedCash).toBe(expectedCash);
      expect(close.countedCash).toBe(expectedCash - 500);
      expect(close.cashDifference).toBe(-500);
      expect(close.transferDifference).toBe(0);
      expect(close.pendingSales.count).toBe(1);
      expect(close.activeExpenses).toEqual({ count: 1, total: 2000 });
      expect(close.override.reason).toContain("transferencia");
      expect(close.override.blockers).toHaveLength(1);
      expect(close.override.blockers[0].code).toBe("PENDING_PAYMENTS");
      expect(close.closedBy.email).toBe(adminEmail);
      expect(close.closedAtLocal).toMatch(LOCAL_ISO);
      expect(close.observation).toBe("Faltan 500 en monedas");
    });

    test("cierre de caja es idempotente por idempotencyKey", async () => {
      const replay = await api.post("closeCashSession", {
        headers: bearer(adminToken),
        data: {
          tenantId,
          countedCash: 1,
          transfersConfirmed: 0,
          override: { reason: "reintento de red" },
          idempotencyKey,
        },
      });
      expect(replay.status(), await replay.text()).toBe(200);
      const replayed = (await replay.json()).data;
      expect(replayed.replayed).toBe(true);
      // Devuelve el cierre original, no reescribe con el payload nuevo.
      expect(replayed.close.cashDifference).toBe(-500);

      const other = await api.post("closeCashSession", {
        headers: bearer(adminToken),
        data: {
          tenantId,
          countedCash: 1,
          transfersConfirmed: 0,
          override: { reason: "segundo cierre" },
          idempotencyKey: `${idempotencyKey}-other`,
        },
      });
      expect(other.status()).toBe(409);
      expect((await other.json()).error.code).toBe("CASH_ALREADY_CLOSED");
    });

    test("caja cerrada cierra la jornada y no permite reabrir", async () => {
      const current = await status();
      expect(current.state).toBe("closed");
      expect(current.reasonCode).toBe("CASH_CLOSED");

      await expectBothChannelsRejected("CASH_CLOSED");

      const reopen = await operate("open", "quiero vender más");
      expect(reopen.status()).toBe(409);
      expect((await reopen.json()).error.code).toBe("CASH_ALREADY_CLOSED");

      const retroactiveExpense = await api.post("createExpense", {
        headers: bearer(adminToken),
        data: {
          tenantId,
          category: "supplies",
          description: "Intento posterior al cierre",
          amount: 1000,
          paymentMethod: "cash",
        },
      });
      expect(retroactiveExpense.status()).toBe(409);
      expect((await retroactiveExpense.json()).error.code).toBe("CONFLICT");
    });

    test("auditoría conserva toda la secuencia con actor, origen y estados", async () => {
      const events: Array<Record<string, any>> = (await control()).events;
      const types = events.map((e) => e.type);
      for (const type of [
        "hours_updated",
        "store_closed",
        "store_reopened",
        "schedule_resumed",
        "store_opened",
        "cash_closed",
      ]) {
        expect(types, `falta evento ${type}`).toContain(type);
      }

      for (const event of events.filter((e) => e.source === "manual")) {
        expect(event.actor.email).toBe(adminEmail);
        expect(event.newState).toBeTruthy();
        expect(event.atLocal).toMatch(LOCAL_ISO);
        expect(typeof event.at).toBe("string");
      }

      const cashEvent = events.find((e) => e.type === "cash_closed")!;
      expect(cashEvent.previousState).toBe("manual_open");
      expect(cashEvent.newState).toBe("closed");
      expect(cashEvent.metadata.override).toBe(true);
      expect(cashEvent.metadata.cashDifference).toBe(-500);

      // Eventos de origen schedule (observación automática) también quedan registrados.
      expect(events.some((e) => e.source === "schedule")).toBe(true);
    });
  });
});
