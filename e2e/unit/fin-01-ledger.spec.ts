import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import * as fnLedger from "../../apps/functions/src/lib/payment-ledger";
import * as adminLedger from "../../apps/admin/src/lib/payment-ledger";
import { computeCashDifferences, summarizeCashDay, type CashCloseOrder } from "../../apps/functions/src/lib/cash-close";
import { rolePermissions } from "../../apps/functions/src/lib/permissions";
import { MEMBERSHIP_ROLES } from "../../apps/functions/src/schemas/membership.schema";
import { derivePaymentEventId } from "../../apps/functions/src/lib/idempotency";
import { getOperationalDateFor } from "../../apps/functions/src/lib/store-hours";
import { getTransferCollectionsInRange } from "../../apps/admin/src/lib/metrics";

/**
 * FIN-01 — lógica pura de confirmación de transferencias (sin emulador).
 * Run: npx playwright test e2e/unit/fin-01-ledger.spec.ts --config=playwright.config.ts
 */

const STATUSES = [undefined, "queued", "preparing", "ready", "on_the_way", "delivered", "cancelled"];
const METHODS = [undefined, "pending", "cash", "card", "transfer"];
const PAYMENT_STATUSES = [undefined, "pending", "paid", "failed", "refunded"];

test.describe("FIN-01 · paridad Functions ↔ admin (Métricas)", () => {
  test("classifyOrderPayment coincide en todas las combinaciones", () => {
    for (const status of STATUSES) {
      for (const paymentMethod of METHODS) {
        for (const paymentStatus of PAYMENT_STATUSES) {
          const order = { status, paymentMethod, paymentStatus, totals: { total: 1000 } };
          expect(adminLedger.classifyOrderPayment(order), JSON.stringify(order)).toEqual(
            fnLedger.classifyOrderPayment(order)
          );
        }
      }
    }
  });

  test("summarizeTransferCollections y ledgerMatchesCounter coinciden", () => {
    const events = [
      { type: "transfer_confirmed", signedAmount: 5000, originOperationalDate: "2026-10-27" },
      { type: "transfer_confirmed", signedAmount: 3000, originOperationalDate: "2026-10-28" },
      { type: "transfer_confirmation_reverted", signedAmount: -5000, originOperationalDate: "2026-10-27" },
    ];
    for (const limit of [1, 2, 3, 500]) {
      const fn = fnLedger.summarizeTransferCollections("2026-10-28", events, limit);
      expect(adminLedger.summarizeTransferCollections("2026-10-28", events, limit)).toEqual(fn);
      const counter = { transferEventCount: 3, transferNet: 3000 };
      expect(adminLedger.ledgerMatchesCounter(fn, counter)).toBe(fnLedger.ledgerMatchesCounter(fn, counter));
    }
    expect(adminLedger.MAX_PAYMENT_EVENTS_PER_DAY).toBe(fnLedger.MAX_PAYMENT_EVENTS_PER_DAY);
    expect(adminLedger.PAYMENT_EVENT_TYPES).toEqual(fnLedger.PAYMENT_EVENT_TYPES);
  });
});

test.describe("FIN-01 · ejes de pago y operación separados", () => {
  const { classifyOrderPayment } = fnLedger;

  test("transferencia confirmada antes de entregar: pagada, no entregada", () => {
    expect(classifyOrderPayment({ status: "queued", paymentMethod: "transfer", paymentStatus: "paid" })).toEqual({
      registeredSale: true,
      deliveredSale: false,
      transfer: "confirmed",
    });
  });

  test("cancelado + pagado = reembolso por revisar, nunca venta", () => {
    expect(classifyOrderPayment({ status: "cancelled", paymentMethod: "transfer", paymentStatus: "paid" })).toEqual({
      registeredSale: false,
      deliveredSale: false,
      transfer: "cancelled_paid",
    });
  });

  test("solo el método transferencia tiene estado de confirmación", () => {
    for (const method of ["cash", "card", "pending", undefined]) {
      expect(classifyOrderPayment({ status: "delivered", paymentMethod: method, paymentStatus: "paid" }).transfer).toBeNull();
    }
  });
});

test.describe("FIN-01 · resumen de caja v2", () => {
  const order = (patch: Partial<CashCloseOrder> & { id: string }): CashCloseOrder => ({
    status: "delivered",
    channel: "admin_pos",
    paymentMethod: "transfer",
    paymentStatus: "pending",
    totals: { total: 1000 },
    ...patch,
  });

  const base = {
    operationalDate: "2026-10-28",
    expenses: [],
    orders: [
      order({ id: "t-unconfirmed", totals: { total: 4500 } }),
      order({ id: "t-confirmed", paymentStatus: "paid", totals: { total: 7000 } }),
      order({ id: "t-cancel-paid", status: "cancelled", paymentStatus: "paid", totals: { total: 2000 } }),
      order({ id: "t-cancel-unpaid", status: "cancelled", totals: { total: 900 } }),
      order({ id: "cash", paymentMethod: "cash", totals: { total: 3000 } }),
    ],
    paymentEvents: [
      { type: "transfer_confirmed", signedAmount: 7000, originOperationalDate: "2026-10-28" },
      { type: "transfer_confirmed", signedAmount: 2000, originOperationalDate: "2026-10-28" },
      { type: "transfer_confirmed", signedAmount: 1500, originOperationalDate: "2026-10-26" },
      { type: "transfer_confirmation_reverted", signedAmount: -800, originOperationalDate: "2026-10-25" },
    ],
  };

  test("separa entregadas, confirmadas, sin confirmar, canceladas pagadas y cobros", () => {
    const s = summarizeCashDay(base);
    expect(s.summaryVersion).toBe(2);
    // Semántica histórica intacta: transferencias entregadas, confirmadas o no.
    expect(s.transferSales).toEqual({ count: 2, total: 11500 });
    expect(s.expectedTransfers).toBe(11500);
    expect(s.transferConfirmedSales).toEqual({ count: 1, total: 7000 });
    expect(s.transferUnconfirmedSales).toEqual({ count: 1, total: 4500 });
    expect(s.cancelledPaidTransfers).toEqual({ count: 1, total: 2000 });
    expect(s.transferCollections).toEqual({
      confirmed: { count: 2, total: 9000 },
      late: { count: 1, total: 1500 },
      unknownOrigin: { count: 0, total: 0 },
      reverted: { count: 1, total: 800 },
      net: 9700,
      eventCount: 4,
      complete: true,
    });
    const blocker = s.blockers.find((b) => b.code === "UNCONFIRMED_TRANSFERS");
    expect(blocker?.orderIds).toEqual(["t-unconfirmed"]);
    expect(blocker?.total).toBe(4500);
  });

  test("transferencia activa sin confirmar bloquea por pedido activo y por confirmación", () => {
    const s = summarizeCashDay({ ...base, orders: [order({ id: "a", status: "ready" })], paymentEvents: [] });
    expect(s.blockers.map((b) => b.code).sort()).toEqual(["ACTIVE_POS_SALES", "UNCONFIRMED_TRANSFERS"]);
  });

  test("sin transferencias pendientes no agrega el blocker", () => {
    const s = summarizeCashDay({ ...base, orders: [order({ id: "p", paymentStatus: "paid" })] });
    expect(s.blockers).toEqual([]);
  });

  test("collectionDifference compara lo verificado en banco con los cobros confirmados", () => {
    const s = summarizeCashDay(base);
    expect(computeCashDifferences(s, { countedCash: 3000, transfersConfirmed: 9700 })).toEqual({
      cashDifference: 0,
      transferDifference: 9700 - 11500,
      collectionDifference: 0,
    });
  });
});

test.describe("FIN-Q01 · libro truncado nunca es total conciliado", () => {
  const many = (n: number) =>
    Array.from({ length: n }, () => ({ type: "transfer_confirmed", signedAmount: 100, originOperationalDate: "2026-10-28" }));

  test("exactamente el tope: completo", () => {
    const c = fnLedger.summarizeTransferCollections("2026-10-28", many(500));
    expect(c.complete).toBe(true);
    expect(c.net).toBe(50000);
    expect(fnLedger.ledgerMatchesCounter(c, { transferEventCount: 500, transferNet: 50000 })).toBe(true);
  });

  test("tope + 1: incompleto y nunca coincide con el contador", () => {
    const c = fnLedger.summarizeTransferCollections("2026-10-28", many(501));
    expect(c.complete).toBe(false);
    expect(c.eventCount).toBe(500);
    expect(fnLedger.ledgerMatchesCounter(c, { transferEventCount: 500, transferNet: 50000 })).toBe(false);
  });

  test("contador ausente cuadra solo con un libro vacío", () => {
    const empty = fnLedger.summarizeTransferCollections("2026-10-28", []);
    expect(fnLedger.ledgerMatchesCounter(empty, undefined)).toBe(true);
    expect(fnLedger.ledgerMatchesCounter(fnLedger.summarizeTransferCollections("2026-10-28", many(1)), undefined)).toBe(false);
  });

  test("Métricas: rango, filtro de canal y bandera de incompletitud", () => {
    const range = { start: new Date("2026-10-28T08:00:00Z"), end: new Date("2026-10-29T08:00:00Z") };
    const events = [
      { type: "transfer_confirmed", signedAmount: 5000, at: new Date("2026-10-28T20:00:00Z") },
      { type: "transfer_confirmation_reverted", signedAmount: -5000, at: new Date("2026-10-28T21:00:00Z") },
      { type: "transfer_confirmed", signedAmount: 4000, at: new Date("2026-10-28T22:00:00Z") },
      { type: "transfer_confirmed", signedAmount: 9999, at: new Date("2026-10-27T22:00:00Z") },
      { type: "transfer_confirmed", signedAmount: 9999, at: null },
    ];
    expect(getTransferCollectionsInRange(events, range, true, "all")).toEqual({
      net: 4000,
      confirmedCount: 2,
      revertedCount: 1,
      complete: true,
    });
    expect(getTransferCollectionsInRange(events, range, false, "all")?.complete).toBe(false);
    expect(getTransferCollectionsInRange(events, range, true, "web")).toBeNull();
  });
});

test.describe("FIN-01 · invariante del libro (propiedad)", () => {
  test("Σ eventos = Σ totales pagados; por pedido Σ ∈ {0, total}; por jornada = contador", () => {
    let seed = 42;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    for (let round = 0; round < 200; round += 1) {
      const orders = Array.from({ length: 6 }, (_, i) => ({ id: `o${i}`, total: 1000 * (i + 1), paid: false }));
      const events: { orderId: string; day: string; signedAmount: number; type: string }[] = [];
      const counters = new Map<string, { transferEventCount: number; transferNet: number }>();
      for (let step = 0; step < 30; step += 1) {
        const target = orders[Math.floor(random() * orders.length)];
        const day = `2026-10-${String(20 + Math.floor(random() * 5)).padStart(2, "0")}`;
        // Mismas guardas que el repositorio: confirmar solo si no está pagado, revertir solo si lo está.
        const type = target.paid ? "transfer_confirmation_reverted" : "transfer_confirmed";
        const signedAmount = target.paid ? -target.total : target.total;
        target.paid = !target.paid;
        events.push({ orderId: target.id, day, signedAmount, type });
        const counter = counters.get(day) ?? { transferEventCount: 0, transferNet: 0 };
        counter.transferEventCount += 1;
        counter.transferNet += signedAmount;
        counters.set(day, counter);
      }
      const ledgerNet = events.reduce((sum, e) => sum + e.signedAmount, 0);
      expect(ledgerNet).toBe(orders.filter((o) => o.paid).reduce((sum, o) => sum + o.total, 0));
      for (const order of orders) {
        const sum = events.filter((e) => e.orderId === order.id).reduce((acc, e) => acc + e.signedAmount, 0);
        expect([0, order.total]).toContain(sum);
      }
      for (const [day, counter] of counters) {
        const collections = fnLedger.summarizeTransferCollections(day, events.filter((e) => e.day === day));
        expect(fnLedger.ledgerMatchesCounter(collections, counter)).toBe(true);
      }
    }
  });
});

test.describe("FIN-H02 · paridad de roles reglas ↔ matriz de Functions", () => {
  test("canViewPayments lista exactamente los roles con payments.view", () => {
    const rules = readFileSync(join(__dirname, "../../firestore.rules"), "utf8");
    const match = /function canViewPayments\(tenantId\)\s*\{[\s\S]*?role in \[([^\]]*)\]/.exec(rules);
    expect(match, "canViewPayments must declare a role list").not.toBeNull();
    const ruleRoles = match![1].split(",").map((role) => role.trim().replace(/'/g, "")).sort();
    const matrixRoles = MEMBERSHIP_ROLES.filter((role) => rolePermissions(role).has("payments.view")).sort();
    expect(ruleRoles).toEqual(matrixRoles);
    expect(MEMBERSHIP_ROLES.filter((role) => rolePermissions(role).has("payments.confirm_transfer")).sort()).toEqual(["admin", "owner"]);
  });

  test("paymentEvents: lectura con canViewPayments y escritura cerrada", () => {
    const rules = readFileSync(join(__dirname, "../../firestore.rules"), "utf8");
    expect(rules).toMatch(/match \/paymentEvents\/\{eventId\} \{\s*allow read: if canViewPayments\(tenantId\);\s*allow write: if false;/);
  });
});

test.describe("FIN-01 · jornada efectiva e IDs de evento", () => {
  const tz = "America/Santiago";

  test("corte 05:00 en hora local, no fecha UTC", () => {
    // 2026-10-28 04:59 -03 = 07:59Z → jornada 27; 05:00 -03 → jornada 28.
    expect(getOperationalDateFor(new Date("2026-10-28T07:59:00Z"), tz)).toBe("2026-10-27");
    expect(getOperationalDateFor(new Date("2026-10-28T08:00:00Z"), tz)).toBe("2026-10-28");
    // 23:30 local del 28 ya es 29 en UTC: la jornada sigue siendo 28.
    expect(getOperationalDateFor(new Date("2026-10-29T02:30:00Z"), tz)).toBe("2026-10-28");
  });

  test("días con cambio de horario (DST)", () => {
    // 2026-04-05: 00:00 -03 → 23:00 -04 del 4. 04:59 -04 = 08:59Z → jornada 4; 05:00 -04 = 09:00Z → 5.
    expect(getOperationalDateFor(new Date("2026-04-05T08:59:00Z"), tz)).toBe("2026-04-04");
    expect(getOperationalDateFor(new Date("2026-04-05T09:00:00Z"), tz)).toBe("2026-04-05");
    // 2026-09-06: 00:00 -04 → 01:00 -03. 04:59 -03 = 07:59Z → jornada 5; 05:00 -03 = 08:00Z → 6.
    expect(getOperationalDateFor(new Date("2026-09-06T07:59:00Z"), tz)).toBe("2026-09-05");
    expect(getOperationalDateFor(new Date("2026-09-06T08:00:00Z"), tz)).toBe("2026-09-06");
  });

  test("ID determinístico por tenant, pedido, acción y clave", () => {
    const id = derivePaymentEventId("t", "o", "transfer_confirmed", "k".repeat(20));
    expect(id).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(derivePaymentEventId("t", "o", "transfer_confirmed", "k".repeat(20))).toBe(id);
    expect(derivePaymentEventId("t", "o", "transfer_confirmation_reverted", "k".repeat(20))).not.toBe(id);
    expect(derivePaymentEventId("t", "o2", "transfer_confirmed", "k".repeat(20))).not.toBe(id);
    expect(derivePaymentEventId("t2", "o", "transfer_confirmed", "k".repeat(20))).not.toBe(id);
  });
});
