import { test, expect } from "@playwright/test";
import { rolePermissions } from "../../apps/functions/src/lib/permissions";
import type { StoreEvent } from "../../apps/admin/src/lib/api/store";
import type { LiveQueryView } from "../../apps/admin/src/lib/payment-presentation";
import {
  buildOperationTimeline,
  canReadPaymentLedger,
  formatSignedClp,
  OPERATION_PAYMENT_EVENTS_LIMIT,
  paymentActorLabel,
  toTimelinePayment,
  type TimelinePaymentEvent,
} from "../../apps/admin/src/lib/operation-timeline";

/**
 * FIN-QA-02 — bitácora de Operación con eventos del libro de pagos.
 * Run: npx playwright test e2e/unit/fin-qa-02-operation-timeline.spec.ts --config=playwright.config.ts
 */

const iso = (minute: number) => new Date(Date.UTC(2026, 9, 28, 15, minute)).toISOString();
const local = (minute: number) => `2026-10-28T12:${String(minute).padStart(2, "0")}:00-03:00`;

function storeEvent(id: string, minute: number): StoreEvent {
  return {
    id,
    type: "store_opened",
    source: "manual",
    actor: { uid: "u-owner", email: "owner@amon.test" },
    reason: null,
    previousState: "closed",
    newState: "open",
    reasonCode: null,
    operationalDate: "2026-10-28",
    metadata: null,
    at: iso(minute),
    atLocal: local(minute),
  } as StoreEvent;
}

function payment(id: string, minute: number, signedAmount = 12500): TimelinePaymentEvent {
  return {
    id,
    type: signedAmount < 0 ? "transfer_confirmation_reverted" : "transfer_confirmed",
    orderId: `order-${id}`,
    signedAmount,
    atMs: Date.parse(iso(minute)),
    atLocal: local(minute),
    actor: { uid: "u-admin", email: "admin@amon.test", role: "admin" },
  };
}

const ready = (data: TimelinePaymentEvent[], complete = true): LiveQueryView<TimelinePaymentEvent[]> => ({
  status: "ready",
  data,
  complete,
});

test.describe("FIN-QA-02 · autorización de la parte financiera", () => {
  test("solo con payments.view; owner y admin lo tienen según la matriz del servidor", () => {
    expect(canReadPaymentLedger(Array.from(rolePermissions("owner")))).toBe(true);
    expect(canReadPaymentLedger(Array.from(rolePermissions("admin")))).toBe(true);
    expect(canReadPaymentLedger(["store.read_control", "cash.close_session"])).toBe(false);
    expect(canReadPaymentLedger([])).toBe(false);
    expect(canReadPaymentLedger(null)).toBe(false);
    expect(canReadPaymentLedger(undefined)).toBe(false);
  });

  test("sin permiso (payments = null): la bitácora es exactamente la previa", () => {
    const events = [storeEvent("s1", 10), storeEvent("s2", 5)];
    const timeline = buildOperationTimeline(events, null);
    expect(timeline.entries.map((entry) => entry.kind)).toEqual(["store", "store"]);
    expect(timeline.paymentNotice).toBeNull();
    expect(timeline.paymentCount).toBe(0);
  });

  test("error de lectura (p. ej. permission-denied): sin filas financieras y con aviso", () => {
    const timeline = buildOperationTimeline([storeEvent("s1", 10)], { status: "error", error: new Error("permission-denied") });
    expect(timeline.entries.every((entry) => entry.kind === "store")).toBe(true);
    expect(timeline.paymentNotice).toMatch(/no disponibles/);
  });

  test("cargando: sin filas financieras ni cifras, con aviso", () => {
    const timeline = buildOperationTimeline([storeEvent("s1", 10)], { status: "loading" });
    expect(timeline.paymentCount).toBe(0);
    expect(timeline.paymentNotice).toMatch(/^Cargando/);
  });
});

test.describe("FIN-QA-02 · cronología y presentación", () => {
  test("intercala por hora, más reciente primero", () => {
    const timeline = buildOperationTimeline(
      [storeEvent("open", 0), storeEvent("close", 50)],
      ready([payment("p1", 20), payment("r1", 30, -12500)])
    );
    expect(timeline.entries.map((entry) => entry.key)).toEqual([
      "store:close",
      "payment:r1",
      "payment:p1",
      "store:open",
    ]);
  });

  test("no duplica: un mismo evento repetido en el resultado aparece una vez", () => {
    const timeline = buildOperationTimeline(
      [storeEvent("s1", 1), storeEvent("s1", 1)],
      ready([payment("p1", 2), payment("p1", 2)])
    );
    expect(timeline.entries.map((entry) => entry.key)).toEqual(["payment:p1", "store:s1"]);
    expect(timeline.paymentCount).toBe(1);
  });

  test("importe con signo, etiqueta de actor", () => {
    expect(formatSignedClp(12500)).toBe("+$12.500");
    expect(formatSignedClp(-12500)).toBe("−$12.500");
    expect(paymentActorLabel({ uid: "u1", email: "admin@amon.test", role: "admin" })).toBe("admin@amon.test");
    expect(paymentActorLabel({ uid: "u1", email: null, role: "admin" })).toBe("u1");
    expect(paymentActorLabel(null)).toBe("Actor no registrado");
  });

  test("lista blanca: referencia, motivo e idempotencia no llegan a la bitácora", () => {
    const row = toTimelinePayment({
      id: "evt1",
      type: "transfer_confirmed",
      orderId: "order1",
      signedAmount: 9900,
      at: { toMillis: () => 1_000 },
      atLocal: local(1),
      actor: { uid: "u1", email: "a@amon.test", role: "admin", extra: "x" },
      reference: "N° op 123456 · cuenta 987",
      reason: "motivo interno",
      idempotency: { version: 1, fingerprint: "abc" },
    } as Parameters<typeof toTimelinePayment>[0]);
    expect(row).toEqual({
      id: "evt1",
      type: "transfer_confirmed",
      orderId: "order1",
      signedAmount: 9900,
      atMs: 1_000,
      atLocal: local(1),
      actor: { uid: "u1", email: "a@amon.test", role: "admin" },
    });
    expect(JSON.stringify(row)).not.toMatch(/123456|motivo|fingerprint|extra/);
  });

  test("documentos no reconocibles se descartan (fail-closed)", () => {
    expect(toTimelinePayment({ id: "x", type: "refund", orderId: "o", signedAmount: 1, at: "2026-10-28T15:00:00Z" })).toBeNull();
    expect(toTimelinePayment({ id: "x", type: "transfer_confirmed", orderId: "o", signedAmount: Number.NaN, at: "2026-10-28T15:00:00Z" })).toBeNull();
    expect(toTimelinePayment({ id: "x", type: "transfer_confirmed", orderId: "o", signedAmount: 1, at: null })).toBeNull();
  });
});

test.describe("FIN-QA-02 · límite de lectura", () => {
  test("historial completo: sin aviso ni marcador", () => {
    const timeline = buildOperationTimeline([storeEvent("s1", 0)], ready([payment("p1", 5)], true));
    expect(timeline.paymentNotice).toBeNull();
    expect(timeline.entries.some((entry) => entry.kind === "payments_gap")).toBe(false);
  });

  test("libro truncado: aviso con la hora de corte y marcador antes de los movimientos más antiguos", () => {
    const payments = Array.from({ length: OPERATION_PAYMENT_EVENTS_LIMIT }, (_, i) => payment(`p${String(i).padStart(3, "0")}`, 20 + (i % 30)));
    const timeline = buildOperationTimeline([storeEvent("old", 1), storeEvent("new", 55)], ready(payments, false));
    expect(timeline.paymentCount).toBe(OPERATION_PAYMENT_EVENTS_LIMIT);
    expect(timeline.paymentNotice).toContain(`los ${OPERATION_PAYMENT_EVENTS_LIMIT} más recientes`);
    expect(timeline.paymentNotice).toContain("28/10/2026 12:20");
    const keys = timeline.entries.map((entry) => entry.key);
    expect(keys[0]).toBe("store:new");
    // El marcador queda justo antes del movimiento de tienda anterior al corte.
    expect(keys.slice(-2)).toEqual(["payments_gap", "store:old"]);
  });

  test("libro truncado sin movimientos anteriores al corte: aviso, sin marcador colgante", () => {
    const timeline = buildOperationTimeline([], ready([payment("p1", 5)], false));
    expect(timeline.paymentNotice).toMatch(/^Pagos parciales/);
    expect(timeline.entries.map((entry) => entry.kind)).toEqual(["payment"]);
  });
});
