import { test, expect } from "@playwright/test";
import { summarizeTransferCollections } from "../../apps/functions/src/lib/payment-ledger";
import { getTransferCollectionsInRange } from "../../apps/admin/src/lib/metrics";
import {
  paymentEventsQueryKey,
  paymentHistoryNotice,
  reconcilableNet,
  selectCurrentResult,
  transferCollectionsCard,
  transferReconciliationDifference,
  type LiveQueryState,
} from "../../apps/admin/src/lib/payment-presentation";

/**
 * FIN-01 — auditoría del parche: FIN-A01 (neto truncado), FIN-A02 (estado de
 * carga y cambio de tenant/rango), FIN-A03 (historial parcial).
 * Run: npx playwright test e2e/unit/fin-01-audit-fixes.spec.ts --config=playwright.config.ts
 */

const money = (value: number) => `$${Math.round(value).toLocaleString("es-CL")}`;
const LIMIT = 500;

/** 500 confirmaciones de $100 dentro del tope y sus reversiones fuera del tope. */
function confirmationsThenReversals() {
  const at = (minute: number) => new Date(Date.UTC(2026, 9, 28, 20, 0, minute));
  const confirmations = Array.from({ length: LIMIT }, (_, i) => ({
    type: "transfer_confirmed",
    signedAmount: 100,
    originOperationalDate: "2026-10-28",
    at: at(i),
  }));
  const reversals = Array.from({ length: LIMIT }, (_, i) => ({
    type: "transfer_confirmation_reverted",
    signedAmount: -100,
    originOperationalDate: "2026-10-28",
    at: at(LIMIT + i),
  }));
  return { confirmations, reversals, all: [...confirmations, ...reversals] };
}

test.describe("FIN-A01 · el neto truncado no es total ni mínimo", () => {
  test("positivos dentro del límite y reversiones fuera: la suma parcial supera al neto real", () => {
    const { all } = confirmationsThenReversals();
    const trueNet = all.reduce((sum, event) => sum + event.signedAmount, 0);
    const partial = summarizeTransferCollections("2026-10-28", all.slice(0, LIMIT + 1), LIMIT);
    expect(trueNet).toBe(0);
    // Demostración del defecto original: el parcial (50.000) NO es un mínimo del real (0).
    expect(partial.net).toBe(50000);
    expect(partial.net).toBeGreaterThan(trueNet);
    expect(partial.complete).toBe(false);
    // La capa de presentación no lo usa.
    expect(reconcilableNet(partial)).toBeNull();
  });

  test("Métricas: lectura truncada → net null y tarjeta 'Incompleto' sin monto", () => {
    const { all } = confirmationsThenReversals();
    const range = { start: new Date("2026-10-28T08:00:00Z"), end: new Date("2026-10-29T08:00:00Z") };
    // Lo que entrega el listener con `limit(tope + 1)`: los primeros 500 y complete=false.
    const collections = getTransferCollectionsInRange(all.slice(0, LIMIT), range, false, "all");
    expect(collections?.net).toBeNull();
    const card = transferCollectionsCard("ready", collections, money(0), money);
    expect(card.value).toBe("Incompleto");
    expect(card.value).not.toMatch(/\$|≥/);
    expect(card.detail).toMatch(/ni mínimo/);
  });

  test("Métricas: lectura completa sí muestra el neto", () => {
    const { confirmations } = confirmationsThenReversals();
    const range = { start: new Date("2026-10-28T08:00:00Z"), end: new Date("2026-10-29T08:00:00Z") };
    const collections = getTransferCollectionsInRange(confirmations.slice(0, 3), range, true, "all");
    expect(transferCollectionsCard("ready", collections, money(0), money).value).toBe(money(300));
  });

  test("caja: sin libro completo no se calcula la diferencia de conciliación", () => {
    const { all } = confirmationsThenReversals();
    const partial = summarizeTransferCollections("2026-10-28", all.slice(0, LIMIT + 1), LIMIT);
    expect(transferReconciliationDifference(0, partial, 999)).toBeNull();
    const complete = summarizeTransferCollections("2026-10-28", all.slice(0, 10), LIMIT);
    expect(transferReconciliationDifference(1500, complete, 999)).toBe(1500 - 1000);
    // Snapshot v1 (sin libro): se concilia contra transferencias entregadas, como antes.
    expect(transferReconciliationDifference(1500, undefined, 999)).toBe(1500 - 999);
  });
});

test.describe("FIN-A02 · solo resultados de la consulta vigente", () => {
  const A = paymentEventsQueryKey("tenant-a", 1000);
  const B = paymentEventsQueryKey("tenant-b", 1000);
  const ready = (key: string, data: number[]): LiveQueryState<number[]> => ({ key, data, complete: true, error: null });

  test("antes del primer snapshot: cargando, nunca $0", () => {
    const view = selectCurrentResult<number[]>({ key: null, data: [], complete: true, error: null }, A);
    expect(view.status).toBe("loading");
    expect(transferCollectionsCard(view.status, null, money(0), money)).toEqual({
      value: "…",
      detail: "Cargando libro de pagos del período",
    });
  });

  test("cambio de tenant: los eventos del tenant anterior no se muestran como actuales", () => {
    expect(selectCurrentResult(ready(A, [5000]), B).status).toBe("loading");
    expect(selectCurrentResult(ready(B, [700]), B)).toEqual({ status: "ready", data: [700], complete: true });
  });

  test("cambio de rango en el mismo tenant también invalida el resultado", () => {
    const today = paymentEventsQueryKey("tenant-a", 1000);
    const last7 = paymentEventsQueryKey("tenant-a", 1000 - 6 * 86_400_000);
    expect(today).not.toBe(last7);
    expect(selectCurrentResult(ready(today, [1]), last7).status).toBe("loading");
  });

  test("cambios rápidos A → B → A: un snapshot tardío de B no se muestra en A", () => {
    // Secuencia: se pide A, luego B, y se vuelve a A antes de que B responda.
    let state: LiveQueryState<number[]> = { key: null, data: [], complete: true, error: null };
    let current = A;
    current = B;
    current = A;
    state = ready(B, [999]); // llega tarde el snapshot de B
    expect(selectCurrentResult(state, current).status).toBe("loading");
    state = ready(A, [100]);
    expect(selectCurrentResult(state, current)).toEqual({ status: "ready", data: [100], complete: true });
  });

  test("error de la consulta anterior no contamina la nueva; error vigente sí se informa", () => {
    const failed: LiveQueryState<number[]> = { key: A, data: [], complete: false, error: new Error("permission-denied") };
    expect(selectCurrentResult(failed, B).status).toBe("loading");
    expect(selectCurrentResult(failed, A).status).toBe("error");
    expect(transferCollectionsCard("error", null, money(0), money).value).toBe("—");
  });
});

test.describe("FIN-A03 · historial parcial declarado", () => {
  test("completo: sin aviso; parcial: aviso explícito con la cantidad mostrada", () => {
    expect(paymentHistoryNotice({ events: [1, 2], complete: true })).toBeNull();
    const notice = paymentHistoryNotice({ events: new Array(100).fill(0), complete: false });
    expect(notice).toMatch(/^Historial parcial/);
    expect(notice).toContain("100 eventos");
  });
});
