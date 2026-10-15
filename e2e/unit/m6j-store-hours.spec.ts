import { test, expect } from "@playwright/test";
import {
  buildDefaultStoreHoursConfig,
  evaluateStoreStatus,
  formatLocalIso,
  getOperationalDayWindow,
  type StoreHoursConfig,
} from "../../apps/functions/src/lib/store-hours";
import {
  computeCashDifferences,
  summarizeCashDay,
  type CashCloseOrder,
} from "../../apps/functions/src/lib/cash-close";

/**
 * M6J — horario operativo y cierre de caja (lógica pura, sin emulador).
 * Run: npx playwright test e2e/unit --config=playwright.config.ts
 *
 * Fechas de referencia:
 * - 2026-10-15 (jueves) Santiago en horario de verano, UTC-3.
 * - 2026-07-15 (miércoles) Santiago en horario de invierno, UTC-4.
 * - DST 2026: 05-abr 00:00 → 04-abr 23:00 (-03 → -04); 06-sep 00:00 → 01:00 (-04 → -03).
 */

const config = buildDefaultStoreHoursConfig();
const at = (iso: string) => new Date(iso);
const evaluate = (now: string, extra: Partial<Parameters<typeof evaluateStoreStatus>[0]> = {}) =>
  evaluateStoreStatus({ now: at(now), config, ...extra });

test.describe("Horario programado 17:30–22:30 America/Santiago", () => {
  test("apertura exacta 17:30:00 acepta pedidos", () => {
    const status = evaluate("2026-10-15T20:30:00Z");
    expect(status.state).toBe("scheduled_open");
    expect(status.acceptingOrders).toBe(true);
    expect(status.localNow).toBe("2026-10-15T17:30:00-03:00");
    expect(status.nextCloseAt).toBe("2026-10-15T22:30:00-03:00");
  });

  test("un segundo antes de abrir está cerrado y anuncia apertura de hoy", () => {
    const status = evaluate("2026-10-15T20:29:59Z");
    expect(status.state).toBe("scheduled_closed");
    expect(status.acceptingOrders).toBe(false);
    expect(status.reasonCode).toBe("BEFORE_OPENING");
    expect(status.nextOpenAt).toBe("2026-10-15T17:30:00-03:00");
    expect(status.message).toContain("hoy 17:30");
  });

  test("antes de apertura (mediodía) está cerrado", () => {
    const status = evaluate("2026-10-15T15:00:00Z");
    expect(status.state).toBe("scheduled_closed");
    expect(status.acceptingOrders).toBe(false);
  });

  test("cierre exacto 22:30:00 ya no acepta pedidos", () => {
    const status = evaluate("2026-10-16T01:30:00Z");
    expect(status.state).toBe("scheduled_closed");
    expect(status.acceptingOrders).toBe(false);
    expect(status.reasonCode).toBe("AFTER_CLOSING");
    expect(status.nextOpenAt).toBe("2026-10-16T17:30:00-03:00");
  });

  test("22:29:59 sigue aceptando, en estado closing", () => {
    const status = evaluate("2026-10-16T01:29:59Z");
    expect(status.state).toBe("closing");
    expect(status.acceptingOrders).toBe(true);
  });

  test("ventana de aviso de cierre es de 15 minutos inclusive", () => {
    expect(evaluate("2026-10-16T01:14:59Z").state).toBe("scheduled_open");
    expect(evaluate("2026-10-16T01:15:00Z").state).toBe("closing");
  });

  test("después del cierre, de madrugada, está cerrado", () => {
    const status = evaluate("2026-10-16T05:00:00Z"); // 02:00 local
    expect(status.state).toBe("scheduled_closed");
    expect(status.operationalDate).toBe("2026-10-15");
    expect(status.nextOpenAt).toBe("2026-10-16T17:30:00-03:00");
  });

  test("día deshabilitado no abre y salta al siguiente día activo", () => {
    const custom: StoreHoursConfig = buildDefaultStoreHoursConfig();
    custom.days.thursday.enabled = false;
    custom.days.friday.enabled = false;
    const status = evaluateStoreStatus({ now: at("2026-10-15T21:00:00Z"), config: custom });
    expect(status.state).toBe("scheduled_closed");
    expect(status.reasonCode).toBe("DAY_DISABLED");
    expect(status.nextOpenAt).toBe("2026-10-17T17:30:00-03:00");
  });

  test("horario distinto por día se respeta", () => {
    const custom: StoreHoursConfig = buildDefaultStoreHoursConfig();
    custom.days.thursday = { enabled: true, open: "12:00", close: "15:00" };
    expect(evaluateStoreStatus({ now: at("2026-10-15T16:00:00Z"), config: custom }).state).toBe(
      "scheduled_open"
    );
    expect(evaluateStoreStatus({ now: at("2026-10-15T20:30:00Z"), config: custom }).state).toBe(
      "scheduled_closed"
    );
  });
});

test.describe("Timezone y DST", () => {
  test("17:30 local es 21:30Z en invierno (UTC-4)", () => {
    expect(evaluate("2026-07-15T21:29:59Z").acceptingOrders).toBe(false);
    const open = evaluate("2026-07-15T21:30:00Z");
    expect(open.state).toBe("scheduled_open");
    expect(open.localNow).toBe("2026-07-15T17:30:00-04:00");
  });

  test("17:30 local es 20:30Z en verano (UTC-3)", () => {
    expect(evaluate("2026-10-15T20:30:00Z").acceptingOrders).toBe(true);
    // El mismo instante UTC en invierno sería 16:30 local: cerrado.
    expect(evaluate("2026-07-15T20:30:00Z").acceptingOrders).toBe(false);
  });

  test("próxima apertura cruza el inicio de DST de septiembre con offset nuevo", () => {
    const status = evaluate("2026-09-06T02:30:00Z"); // sáb 05-sep 22:30 -04
    expect(status.state).toBe("scheduled_closed");
    expect(status.nextOpenAt).toBe("2026-09-06T17:30:00-03:00");
    expect(new Date(status.nextOpenAt!).toISOString()).toBe("2026-09-06T20:30:00.000Z");
  });

  test("próxima apertura cruza el fin de DST de abril con offset nuevo", () => {
    const status = evaluate("2026-04-05T01:30:00Z"); // sáb 04-abr 22:30 -03
    expect(status.nextOpenAt).toBe("2026-04-05T17:30:00-04:00");
    expect(new Date(status.nextOpenAt!).toISOString()).toBe("2026-04-05T21:30:00.000Z");
  });

  test("ventana del día operacional mide 25h el día que se atrasa el reloj", () => {
    const { start, end } = getOperationalDayWindow("2026-04-04", "America/Santiago");
    expect(formatLocalIso(start, "America/Santiago")).toBe("2026-04-04T05:00:00-03:00");
    expect(formatLocalIso(end, "America/Santiago")).toBe("2026-04-05T05:00:00-04:00");
    expect(end.getTime() - start.getTime()).toBe(25 * 3600 * 1000);
  });

  test("no depende de la timezone del proceso", () => {
    const previous = process.env.TZ;
    try {
      process.env.TZ = "Asia/Tokyo";
      const tokyo = evaluate("2026-10-15T20:30:00Z");
      process.env.TZ = "UTC";
      const utc = evaluate("2026-10-15T20:30:00Z");
      expect(tokyo).toEqual(utc);
      expect(tokyo.state).toBe("scheduled_open");
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
});

test.describe("Overrides manuales", () => {
  const actor = { uid: "admin-1", email: "admin@tbb.cl" };

  test("cierre anticipado manual bloquea dentro del horario", () => {
    const status = evaluate("2026-10-15T22:00:00Z", {
      override: { mode: "closed", operationalDate: "2026-10-15", reason: "Sin gas", actor },
    });
    expect(status.state).toBe("manual_closed");
    expect(status.acceptingOrders).toBe(false);
    expect(status.source).toBe("manual");
    // El cierre manual dura el día operacional: próxima apertura es mañana.
    expect(status.nextOpenAt).toBe("2026-10-16T17:30:00-03:00");
  });

  test("cierre manual antes de abrir impide la apertura programada de hoy", () => {
    const status = evaluate("2026-10-15T18:00:00Z", {
      override: { mode: "closed", operationalDate: "2026-10-15" },
    });
    expect(status.state).toBe("manual_closed");
    expect(status.nextOpenAt).toBe("2026-10-16T17:30:00-03:00");
  });

  test("reapertura manual vuelve a aceptar pedidos", () => {
    const status = evaluate("2026-10-15T22:00:00Z", {
      override: { mode: "open", operationalDate: "2026-10-15", actor },
    });
    expect(status.state).toBe("manual_open");
    expect(status.acceptingOrders).toBe(true);
  });

  test("retomar horario (sin override) vuelve al estado programado", () => {
    expect(evaluate("2026-10-15T22:00:00Z", { override: null }).state).toBe("scheduled_open");
  });

  test("apertura manual fuera de horario vence al corte operacional de las 05:00", () => {
    const status = evaluate("2026-10-15T15:00:00Z", {
      override: { mode: "open", operationalDate: "2026-10-15" },
    });
    expect(status.state).toBe("manual_open");
    expect(status.nextCloseAt).toBe("2026-10-16T05:00:00-03:00");
  });

  test("override sigue vigente de madrugada dentro del mismo día operacional", () => {
    const status = evaluate("2026-10-16T05:00:00Z", {
      override: { mode: "open", operationalDate: "2026-10-15" },
    });
    expect(status.state).toBe("manual_open");
  });

  test("override de un día operacional anterior se ignora", () => {
    const status = evaluate("2026-10-15T22:00:00Z", {
      override: { mode: "closed", operationalDate: "2026-10-14" },
    });
    expect(status.state).toBe("scheduled_open");
    expect(status.override).toBeNull();
  });

  test("override corrupto deja la tienda cerrada", () => {
    const status = evaluate("2026-10-15T22:00:00Z", { override: { mode: "maybe" } });
    expect(status.state).toBe("closed");
    expect(status.reasonCode).toBe("OVERRIDE_INVALID");
    expect(status.acceptingOrders).toBe(false);
  });

  test("caja cerrada cierra la jornada aunque haya apertura manual", () => {
    const status = evaluate("2026-10-15T22:00:00Z", {
      override: { mode: "open", operationalDate: "2026-10-15" },
      cashClosedOperationalDate: "2026-10-15",
    });
    expect(status.state).toBe("closed");
    expect(status.reasonCode).toBe("CASH_CLOSED");
    expect(status.acceptingOrders).toBe(false);
    expect(status.nextOpenAt).toBe("2026-10-16T17:30:00-03:00");
  });

  test("cierre de caja de otro día no afecta la jornada actual", () => {
    expect(
      evaluate("2026-10-15T22:00:00Z", { cashClosedOperationalDate: "2026-10-14" }).state
    ).toBe("scheduled_open");
  });
});

test.describe("Fail-closed", () => {
  test("configuración ausente → cerrada", () => {
    for (const missing of [null, undefined]) {
      const status = evaluateStoreStatus({ now: at("2026-10-15T22:00:00Z"), config: missing });
      expect(status.state).toBe("closed");
      expect(status.reasonCode).toBe("CONFIG_MISSING");
      expect(status.acceptingOrders).toBe(false);
      expect(status.localNow).toBe("2026-10-15T19:00:00-03:00");
    }
  });

  const invalidConfigs: [string, unknown][] = [
    ["hora fuera de rango", { ...config, days: { ...config.days, thursday: { enabled: true, open: "25:00", close: "22:30" } } }],
    ["cierre antes de apertura", { ...config, days: { ...config.days, thursday: { enabled: true, open: "22:30", close: "17:30" } } }],
    ["ventana vacía", { ...config, days: { ...config.days, thursday: { enabled: true, open: "17:30", close: "17:30" } } }],
    ["timezone inexistente", { ...config, timezone: "Mars/Olympus" }],
    ["día faltante", { ...config, days: { ...config.days, sunday: undefined } }],
    ["no es objeto", "17:30-22:30"],
    ["aviso negativo", { ...config, closingWarningMinutes: -5 }],
  ];

  for (const [name, raw] of invalidConfigs) {
    test(`configuración inválida (${name}) → cerrada`, () => {
      const status = evaluateStoreStatus({ now: at("2026-10-15T22:00:00Z"), config: raw });
      expect(status.state).toBe("closed");
      expect(status.reasonCode).toBe("CONFIG_INVALID");
      expect(status.acceptingOrders).toBe(false);
      expect(status.configErrors?.length).toBeGreaterThan(0);
    });
  }

  test("configuración inválida domina sobre apertura manual", () => {
    const status = evaluateStoreStatus({
      now: at("2026-10-15T22:00:00Z"),
      config: { ...config, timezone: "Mars/Olympus" },
      override: { mode: "open", operationalDate: "2026-10-15" },
    });
    expect(status.acceptingOrders).toBe(false);
  });

  test("reloj inválido → cerrada por error de evaluación", () => {
    const status = evaluateStoreStatus({ now: new Date(Number.NaN), config });
    expect(status.state).toBe("closed");
    expect(status.reasonCode).toBe("EVALUATION_ERROR");
    expect(status.acceptingOrders).toBe(false);
  });

  test("solo scheduled_open, closing y manual_open aceptan pedidos", () => {
    const samples = [
      evaluate("2026-10-15T15:00:00Z"),
      evaluate("2026-10-15T22:00:00Z"),
      evaluate("2026-10-16T01:20:00Z"),
      evaluate("2026-10-15T22:00:00Z", { override: { mode: "open", operationalDate: "2026-10-15" } }),
      evaluate("2026-10-15T22:00:00Z", { override: { mode: "closed", operationalDate: "2026-10-15" } }),
      evaluateStoreStatus({ now: at("2026-10-15T22:00:00Z"), config: null }),
    ];
    for (const status of samples) {
      expect(status.acceptingOrders).toBe(
        ["scheduled_open", "closing", "manual_open"].includes(status.state)
      );
    }
  });
});

test.describe("Cierre de caja", () => {
  const order = (overrides: Partial<CashCloseOrder> & { id: string }): CashCloseOrder => ({
    status: "delivered",
    channel: "admin_pos",
    paymentMethod: "cash",
    totals: { total: 10000 },
    ...overrides,
  });

  test("pending no cuenta como dinero recibido y bloquea el cierre", () => {
    const summary = summarizeCashDay({
      operationalDate: "2026-10-15",
      orders: [
        order({ id: "a" }),
        order({ id: "b", paymentMethod: "pending", totals: { total: 7000 }, displayCode: "002" }),
      ],
      expenses: [],
    });
    expect(summary.cashSales).toEqual({ count: 1, total: 10000 });
    expect(summary.pendingSales).toEqual({ count: 1, total: 7000 });
    expect(summary.expectedCash).toBe(10000);
    expect(summary.blockers).toEqual([
      expect.objectContaining({ code: "PENDING_PAYMENTS", count: 1, total: 7000, displayCodes: ["002"] }),
    ]);
  });

  test("ventas POS activas bloquean; pedidos web activos solo advierten", () => {
    const summary = summarizeCashDay({
      operationalDate: "2026-10-15",
      orders: [
        order({ id: "pos", status: "queued" }),
        order({ id: "web", status: "preparing", channel: "web" }),
      ],
      expenses: [],
    });
    expect(summary.blockers.map((blocker) => blocker.code)).toEqual(["ACTIVE_POS_SALES"]);
    expect(summary.activeOtherOrders.count).toBe(1);
    // Ninguna está entregada: todavía no es dinero en caja.
    expect(summary.expectedCash).toBe(0);
  });

  test("cancelados no suman; transferencias y tarjeta van aparte", () => {
    const summary = summarizeCashDay({
      operationalDate: "2026-10-15",
      orders: [
        order({ id: "a" }),
        order({ id: "b", status: "cancelled", totals: { total: 99999 } }),
        order({ id: "c", paymentMethod: "transfer", totals: { total: 4500 } }),
        order({ id: "d", paymentMethod: "card", totals: { total: 3000 } }),
      ],
      expenses: [],
    });
    expect(summary.cancelledCount).toBe(1);
    expect(summary.ordersCount).toBe(3);
    expect(summary.cashSales.total).toBe(10000);
    expect(summary.expectedTransfers).toBe(4500);
    expect(summary.cardSales.total).toBe(3000);
    expect(summary.blockers).toEqual([]);
  });

  test("gastos activos en efectivo descuentan del efectivo esperado", () => {
    const summary = summarizeCashDay({
      operationalDate: "2026-10-15",
      orders: [order({ id: "a", totals: { total: 30000 } })],
      expenses: [
        { id: "e1", amount: 5000, paymentMethod: "cash", status: "active" },
        { id: "e2", amount: 8000, paymentMethod: "transfer", status: "active" },
        { id: "e3", amount: 2000, paymentMethod: "cash", status: "voided" },
      ],
    });
    expect(summary.activeExpenses).toEqual({ count: 2, total: 13000 });
    expect(summary.cashExpenses).toEqual({ count: 1, total: 5000 });
    expect(summary.expectedCash).toBe(25000);
  });

  test("diferencia de caja: faltante negativo, sobrante positivo", () => {
    const expected = { expectedCash: 25000, expectedTransfers: 4500 };
    expect(computeCashDifferences(expected, { countedCash: 24000, transfersConfirmed: 4500 })).toEqual({
      cashDifference: -1000,
      transferDifference: 0,
    });
    expect(computeCashDifferences(expected, { countedCash: 25500, transfersConfirmed: 0 })).toEqual({
      cashDifference: 500,
      transferDifference: -4500,
    });
  });
});
