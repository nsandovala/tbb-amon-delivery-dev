import { test, expect } from "@playwright/test";
import * as fnLedger from "../../apps/functions/src/lib/payment-ledger";
import * as adminLedger from "../../apps/admin/src/lib/payment-ledger";
import { computeCashDifferences, evaluateDiscrepancy } from "../../apps/functions/src/lib/cash-close";
import { closeCashSessionInputSchema } from "../../apps/functions/src/schemas/cash-close.schema";
import {
  cashCloseReadiness,
  differenceLabel,
  transferDifferenceRows,
  type CashCloseReadinessInput,
} from "../../apps/admin/src/lib/cash-close-presentation";
import { seedOperationalDate, withSeedOperationalDate } from "../../packages/shared/src/seed-orders";
import { METRIC_HELP_INITIAL, metricHelpReducer, type MetricHelpEvent } from "../../apps/admin/src/lib/metric-help";
import { TBB_ORDERS } from "../../packages/shared/src/data/tbb/orders";
import { getOperationalDateFor } from "../../apps/functions/src/lib/store-hours";

/**
 * FIN-01 correcciones de QA (FIN-CLOSE-01/02, FIN-DATA-01, CASH-CLOSE-UX-01), lógica pura.
 * Run: npx playwright test e2e/unit/fin-01-corrections.spec.ts --config=playwright.config.ts
 */

const DAY = "2026-10-28";

test.describe("FIN-DATA-01 · origen desconocido nunca es «misma jornada»", () => {
  const confirmed = (originOperationalDate: unknown, signedAmount = 1000) =>
    ({ type: "transfer_confirmed", signedAmount, originOperationalDate }) as fnLedger.LedgerEvent;

  test("null, ausente, inválido o futuro van a unknownOrigin; el neto no cambia", () => {
    const events = [
      confirmed(DAY, 1000),
      confirmed("2026-10-27", 2000),
      confirmed(null, 3000),
      { type: "transfer_confirmed", signedAmount: 4000 },
      confirmed("28-10-2026", 5000),
      confirmed("2026-10-29", 6000),
      { type: "transfer_confirmation_reverted", signedAmount: -3000, originOperationalDate: null },
    ];
    const result = fnLedger.summarizeTransferCollections(DAY, events);
    expect(result.confirmed).toEqual({ count: 1, total: 1000 });
    expect(result.late).toEqual({ count: 1, total: 2000 });
    expect(result.unknownOrigin).toEqual({ count: 4, total: 3000 + 4000 + 5000 + 6000 });
    expect(result.reverted).toEqual({ count: 1, total: 3000 });
    expect(result.net).toBe(1000 + 2000 + 3000 + 4000 + 5000 + 6000 - 3000);
    expect(result.eventCount).toBe(events.length);
  });

  test("FIN-H01 intacto: ledgerMatchesCounter solo mira neto y conteo", () => {
    const events = [confirmed(null, 10990)];
    const collections = fnLedger.summarizeTransferCollections(DAY, events);
    expect(fnLedger.ledgerMatchesCounter(collections, { transferEventCount: 1, transferNet: 10990 })).toBe(true);
    expect(fnLedger.ledgerMatchesCounter(collections, { transferEventCount: 1, transferNet: 0 })).toBe(false);
  });

  test("paridad Functions ↔ admin con orígenes desconocidos", () => {
    const origins = [DAY, "2026-10-27", "2026-10-29", null, undefined, "", "x", 20261028];
    const events = origins.map((origin, i) => confirmed(origin, 100 * (i + 1)));
    for (const limit of [1, 4, 500]) {
      expect(adminLedger.summarizeTransferCollections(DAY, events as adminLedger.LedgerEvent[], limit))
        .toEqual(fnLedger.summarizeTransferCollections(DAY, events, limit));
    }
  });

  test("seed: todos los TBB_ORDERS reciben la jornada en que se crean", () => {
    const now = new Date("2026-10-29T03:30:00Z"); // 00:30 -03 del 29 → jornada 28
    const stamped = withSeedOperationalDate(TBB_ORDERS, now, "America/Santiago");
    expect(stamped).toHaveLength(TBB_ORDERS.length);
    for (const order of stamped) expect(order.operationalDate).toBe("2026-10-28");
    // No muta el fixture original.
    for (const order of TBB_ORDERS) expect("operationalDate" in order).toBe(false);
  });

  test("seed usa la misma regla de corte que Functions (incluye DST)", () => {
    const instants = [
      "2026-10-28T07:59:00Z", "2026-10-28T08:00:00Z", "2026-10-29T02:30:00Z",
      "2026-04-05T08:59:00Z", "2026-04-05T09:00:00Z", "2026-09-06T07:59:00Z", "2026-09-06T08:00:00Z",
    ];
    for (const iso of instants) {
      expect(seedOperationalDate(new Date(iso), "America/Santiago"), iso)
        .toBe(getOperationalDateFor(new Date(iso), "America/Santiago"));
    }
  });
});

test.describe("FIN-CLOSE-01 · diferencias declaradas", () => {
  const zero = { cashDifference: 0, collectionDifference: 0 };

  test("sin diferencias no se exige motivo", () => {
    expect(evaluateDiscrepancy(zero, undefined)).toBe("none");
  });

  test("diferencia de efectivo o de conciliación exige motivo", () => {
    expect(evaluateDiscrepancy({ cashDifference: 23000, collectionDifference: 0 }, undefined)).toBe("reason_required");
    expect(evaluateDiscrepancy({ cashDifference: 0, collectionDifference: -500 }, undefined)).toBe("reason_required");
  });

  test("transferDifference (operacional) no exige motivo", () => {
    const differences = computeCashDifferences(
      { expectedCash: 0, expectedTransfers: 0, transferCollections: { net: 10990 } },
      { countedCash: 0, transfersConfirmed: 10990 }
    );
    expect(differences).toEqual({ cashDifference: 0, transferDifference: 10990, collectionDifference: 0 });
    expect(evaluateDiscrepancy(differences, undefined)).toBe("none");
  });

  test("declaración coincidente se acepta; cualquier cifra distinta es stale", () => {
    const real = { cashDifference: 23000, collectionDifference: 0 };
    expect(evaluateDiscrepancy(real, { ...real })).toBe("accepted");
    expect(evaluateDiscrepancy(real, { cashDifference: 22000, collectionDifference: 0 })).toBe("stale");
    expect(evaluateDiscrepancy(real, { cashDifference: 23000, collectionDifference: 1 })).toBe("stale");
    // Declarar una diferencia que ya no existe tampoco se acepta tácitamente.
    expect(evaluateDiscrepancy(zero, { cashDifference: 500, collectionDifference: 0 })).toBe("stale");
  });

  const base = { countedCash: 0, transfersConfirmed: 0, idempotencyKey: "fin01-unit-key" };

  test("schema: motivo ≥ 10, aceptación literal y modo por defecto manual", () => {
    const parsed = closeCashSessionInputSchema.parse(base);
    expect(parsed.transfersEntryMode).toBe("manual");
    const discrepancy = { reason: "Vuelto mal dado", acknowledged: true, cashDifference: -500, collectionDifference: 0 };
    expect(closeCashSessionInputSchema.safeParse({ ...base, discrepancy }).success).toBe(true);
    expect(closeCashSessionInputSchema.safeParse({ ...base, discrepancy: { ...discrepancy, reason: "corto" } }).success).toBe(false);
    expect(closeCashSessionInputSchema.safeParse({ ...base, discrepancy: { ...discrepancy, acknowledged: false } }).success).toBe(false);
    expect(closeCashSessionInputSchema.safeParse({ ...base, discrepancy: { ...discrepancy, cashDifference: 0.5 } }).success).toBe(false);
  });

  test("schema D3: ledger_suggestion exige bankVerified y el mismo importe", () => {
    const ok = { ...base, transfersConfirmed: 7000, transfersEntryMode: "ledger_suggestion", ledgerSuggestion: { suggestedAmount: 7000, bankVerified: true } };
    expect(closeCashSessionInputSchema.safeParse(ok).success).toBe(true);
    expect(closeCashSessionInputSchema.safeParse({ ...ok, ledgerSuggestion: undefined }).success).toBe(false);
    expect(closeCashSessionInputSchema.safeParse({ ...ok, ledgerSuggestion: { suggestedAmount: 7000, bankVerified: false } }).success).toBe(false);
    expect(closeCashSessionInputSchema.safeParse({ ...ok, transfersConfirmed: 7001 }).success).toBe(false);
    expect(closeCashSessionInputSchema.safeParse({ ...ok, transfersEntryMode: "manual" }).success).toBe(false);
    expect(closeCashSessionInputSchema.safeParse({ ...base, transfersEntryMode: "bank_api" }).success).toBe(false);
  });
});

test.describe("FIN-CLOSE-02 · etiquetas del comprobante", () => {
  test("v2: conciliación financiera primero, operacional rotulada como tal", () => {
    const rows = transferDifferenceRows({ transferDifference: 10990, collectionDifference: 0 });
    expect(rows.map((row) => [row.id, row.kind])).toEqual([["collection", "financial"], ["operational", "operational"]]);
    expect(differenceLabel(rows[0].value, rows[0].kind)).toBe("Cuadra");
    // El caso del QA ya no dice «Sobrante» para la comparación operacional.
    expect(differenceLabel(rows[1].value, rows[1].kind)).toBe("+");
    expect(rows[1].label).toMatch(/operacional/i);
  });

  test("v1 (sin collectionDifference) conserva una sola fila financiera", () => {
    const rows = transferDifferenceRows({ transferDifference: -2000 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "transfer-v1", kind: "financial", value: -2000 });
    expect(differenceLabel(-2000, "financial")).toBe("Faltante");
  });
});

test.describe("CASH-CLOSE-UX-01 · motivos del botón deshabilitado", () => {
  const ready: CashCloseReadinessInput = {
    hasSummary: true,
    summaryStale: false,
    ledgerConsistent: true,
    collectionsComplete: true,
    blockers: [],
    counted: { ok: true, value: 0 },
    transfers: { ok: true, value: 0 },
    useOverride: false,
    overrideReason: "",
    differences: { cashDifference: 0, collectionDifference: 0 },
    discrepancyReason: "",
    discrepancyAcknowledged: false,
    ledgerSuggestionActive: false,
    bankVerified: false,
    busy: false,
  };
  const check = (patch: Partial<CashCloseReadinessInput>) => cashCloseReadiness({ ...ready, ...patch });

  test("todo listo: habilitado sin motivos", () => {
    expect(check({})).toEqual({ canSubmit: true, reasons: [], overrideAllowed: true, needsDiscrepancy: false });
    expect(check({ busy: true }).canSubmit).toBe(false);
  });

  test("cada causa tiene su motivo legible", () => {
    const cases: [Partial<CashCloseReadinessInput>, RegExp][] = [
      [{ hasSummary: false }, /Cargando/],
      [{ summaryStale: true }, /actualizar el resumen/],
      [{ ledgerConsistent: false }, /no coincide con su contador/],
      [{ collectionsComplete: false }, /tope de eventos/],
      [{ counted: null }, /efectivo contado en CLP \(0 si no hubo\)/],
      [{ counted: { ok: false, message: "x" } }, /Corrige el efectivo/],
      [{ transfers: null }, /transferencias verificadas en el banco en CLP/],
      [{ transfers: { ok: false, message: "x" } }, /Corrige el monto de transferencias/],
      [{ blockers: [{ code: "PENDING_PAYMENTS", displayCodes: ["001"] }] }, /override administrativo/],
      [{ blockers: [{ code: "PENDING_PAYMENTS", displayCodes: ["001"] }], useOverride: true, overrideReason: "ab" }, /faltan 3 caracteres/],
      [{ ledgerSuggestionActive: true }, /contrastaste con el banco/],
      [{ differences: { cashDifference: 23000, collectionDifference: 0 } }, /motivo de la diferencia \(faltan 10/],
    ];
    for (const [patch, reason] of cases) {
      const result = check(patch);
      expect(result.canSubmit, JSON.stringify(patch)).toBe(false);
      expect(result.reasons.join(" | "), JSON.stringify(patch)).toMatch(reason);
    }
  });

  test("pedidos activos: sin override ofrecido, igual que el servidor", () => {
    const result = check({
      blockers: [
        { code: "ACTIVE_OTHER_ORDERS", displayCodes: ["DEMO01"] },
        { code: "PENDING_PAYMENTS", displayCodes: ["002"] },
      ],
      useOverride: true,
      overrideReason: "motivo largo suficiente",
    });
    expect(result.overrideAllowed).toBe(false);
    expect(result.canSubmit).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/#DEMO01.*El override no aplica/);
  });

  test("diferencia: exige motivo y aceptación; con ambos se habilita", () => {
    const differences = { cashDifference: 23000, collectionDifference: 0 };
    expect(check({ differences, discrepancyReason: "Fondo de caja inicial" }).reasons).toEqual([
      "Confirma que cierras la caja con diferencia.",
    ]);
    expect(check({ differences, discrepancyReason: "Fondo de caja inicial", discrepancyAcknowledged: true }))
      .toMatchObject({ canSubmit: true, needsDiscrepancy: true });
  });

  test("sugerencia del libro: solo con contraste bancario declarado", () => {
    expect(check({ ledgerSuggestionActive: true, bankVerified: true }).canSubmit).toBe(true);
  });
});

test.describe("FIN-R04 · la jornada de origen debe ser un día real", () => {
  const valid = ["2026-10-28", "2026-02-28", "2024-02-29", "2000-02-29", "2026-12-31", "2026-01-01"];
  const invalid = [
    "2026-02-30", "2026-13-45", "2026-02-29", "1900-02-29", "2026-04-31", "2026-00-10", "2026-10-00",
    "2026-10-32", "2026-1-05", "28-10-2026", "", null, undefined, 20261028,
  ];

  test("acepta fechas reales, incluido el 29 de febrero bisiesto", () => {
    for (const value of valid) {
      expect(fnLedger.isOperationalDate(value), value).toBe(true);
      expect(adminLedger.isOperationalDate(value), value).toBe(true);
    }
  });

  test("rechaza fechas imposibles, mal formadas y null en ambas copias", () => {
    for (const value of invalid) {
      expect(fnLedger.isOperationalDate(value), String(value)).toBe(false);
      expect(adminLedger.isOperationalDate(value), String(value)).toBe(false);
    }
  });

  test("fecha imposible, null o futura van a unknownOrigin; el neto no cambia", () => {
    const event = (originOperationalDate: unknown, signedAmount: number) =>
      ({ type: "transfer_confirmed", signedAmount, originOperationalDate }) as fnLedger.LedgerEvent;
    const events = [
      event(DAY, 1000),
      event("2026-10-27", 2000),
      event("2024-02-29", 4000),
      event("2026-02-30", 8000),
      event("2026-13-45", 16000),
      event(null, 32000),
      event("2026-10-29", 64000),
    ];
    const result = fnLedger.summarizeTransferCollections(DAY, events);
    expect(result.confirmed).toEqual({ count: 1, total: 1000 });
    expect(result.late).toEqual({ count: 2, total: 2000 + 4000 });
    expect(result.unknownOrigin).toEqual({ count: 4, total: 8000 + 16000 + 32000 + 64000 });
    expect(result.net).toBe(127000);
    expect(result.eventCount).toBe(events.length);
    for (const limit of [1, 3, 500]) {
      expect(adminLedger.summarizeTransferCollections(DAY, events as adminLedger.LedgerEvent[], limit))
        .toEqual(fnLedger.summarizeTransferCollections(DAY, events, limit));
    }
  });
});

test.describe("FIN-R05 · ayuda de Métricas: Escape gana sobre foco y hover", () => {
  const run = (...events: MetricHelpEvent[]) => events.reduce(metricHelpReducer, METRIC_HELP_INITIAL);

  test("teclado: abrir, Escape, volver a abrir, salir", () => {
    expect(run("toggle")).toEqual({ open: true, dismissed: false });
    expect(run("toggle", "escape")).toEqual({ open: false, dismissed: true });
    expect(run("escape")).toEqual({ open: false, dismissed: true });
    expect(run("toggle", "escape", "toggle")).toEqual({ open: true, dismissed: false });
    expect(run("toggle", "escape", "blur")).toEqual(METRIC_HELP_INITIAL);
  });

  test("clic/toque: el segundo toque cierra aunque el hover siga pegado", () => {
    expect(run("toggle", "toggle")).toEqual({ open: false, dismissed: true });
    expect(run("toggle", "toggle", "pointerleave")).toEqual(METRIC_HELP_INITIAL);
  });

  test("salir con el puntero no reabre una ayuda abierta ni cambia el estado sin Escape", () => {
    expect(run("toggle", "pointerleave")).toEqual({ open: true, dismissed: false });
    expect(run("pointerleave")).toBe(METRIC_HELP_INITIAL);
  });
});
