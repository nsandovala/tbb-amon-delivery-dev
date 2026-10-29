import { test, expect } from "@playwright/test";
import { paymentEventsUntilMs } from "../../apps/admin/src/lib/payment-events-query";
import { paymentEventsQueryKey, selectCurrentResult, type LiveQueryState } from "../../apps/admin/src/lib/payment-presentation";

/**
 * PR #88 (P2-02) — identidad de la consulta de `paymentEvents` de Métricas.
 * La consulta real contra el emulador está en
 * e2e/api/pr88-payment-events-range.contract.spec.ts.
 */

const MINUTE = 60_000;
const ready = (key: string): LiveQueryState<number[]> => ({ key, data: [1], complete: true, error: null });

test("período en curso (fin = ahora): consulta abierta y clave estable con el reloj de 60 s", () => {
  const start = Date.parse("2026-10-29T08:00:00.000Z");
  let nowMs = Date.parse("2026-10-29T15:00:00.000Z");
  const keys = new Set<string>();
  for (let tick = 0; tick < 120; tick += 1, nowMs += MINUTE) {
    const rangeEnd = nowMs; // rangeFor: end = new Date(now)
    const untilMs = paymentEventsUntilMs(rangeEnd, nowMs);
    expect(untilMs).toBeNull();
    keys.add(paymentEventsQueryKey("tenant-a", start, untilMs));
  }
  // Dos horas de ticks: una sola suscripción.
  expect(keys.size).toBe(1);
});

test("período histórico: fin acotado y clave estable mientras avanza el reloj", () => {
  const start = Date.parse("2026-01-10T03:00:00.000Z");
  const end = Date.parse("2026-01-11T02:59:59.999Z");
  let nowMs = Date.parse("2026-10-29T15:00:00.000Z");
  const keys = new Set<string>();
  for (let tick = 0; tick < 120; tick += 1, nowMs += MINUTE) {
    expect(paymentEventsUntilMs(end, nowMs)).toBe(end);
    keys.add(paymentEventsQueryKey("tenant-a", start, paymentEventsUntilMs(end, nowMs)));
  }
  expect(keys.size).toBe(1);
});

test("cambiar el fin del período invalida de inmediato el resultado anterior", () => {
  const start = Date.parse("2026-01-01T03:00:00.000Z");
  const endA = Date.parse("2026-01-11T02:59:59.999Z");
  const endB = Date.parse("2026-01-08T02:59:59.999Z");
  const keyA = paymentEventsQueryKey("tenant-a", start, endA);
  const keyB = paymentEventsQueryKey("tenant-a", start, endB);
  const keyOpen = paymentEventsQueryKey("tenant-a", start, null);
  expect(new Set([keyA, keyB, keyOpen]).size).toBe(3);
  expect(selectCurrentResult(ready(keyA), keyB).status).toBe("loading");
  expect(selectCurrentResult(ready(keyOpen), keyA).status).toBe("loading");
  expect(selectCurrentResult(ready(keyB), keyB).status).toBe("ready");
  // Tenant e inicio siguen formando parte de la identidad.
  expect(paymentEventsQueryKey("tenant-b", start, endA)).not.toBe(keyA);
  expect(paymentEventsQueryKey("tenant-a", start + 1, endA)).not.toBe(keyA);
});

test("un período personalizado que termina hoy sigue en curso; al pasar su fin queda acotado", () => {
  const customFinish = Date.parse("2026-10-30T02:59:59.999Z"); // 29-10 23:59:59.999 en Santiago
  const before = Date.parse("2026-10-29T20:00:00.000Z");
  // rangeFor: end = min(customFinish, now) → antes del fin, end = now.
  expect(paymentEventsUntilMs(Math.min(customFinish, before), before)).toBeNull();
  const afterEnd = customFinish + 1;
  expect(paymentEventsUntilMs(Math.min(customFinish, afterEnd), afterEnd)).toBe(customFinish);
});
