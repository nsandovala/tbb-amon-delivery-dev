/**
 * FIN-01 correcciones (FIN-CLOSE-01/02, CASH-CLOSE-UX-01) — reglas puras del
 * panel de cierre de caja. El servidor sigue siendo la autoridad: esto solo
 * explica al operador por qué no puede cerrar y qué significa cada diferencia.
 * Contrato: docs/architecture/store-operation-contract.md
 */

import type { CashCloseBlocker, CashCloseRecord } from "./api/store";

/** Mínimos espejados del schema de `closeCashSession`. */
export const OVERRIDE_REASON_MIN = 5;
export const DISCREPANCY_REASON_MIN = 10;

/** Bloqueos que el servidor nunca deja pasar con override. */
const NON_OVERRIDABLE: CashCloseBlocker["code"][] = ["ACTIVE_POS_SALES", "ACTIVE_OTHER_ORDERS"];

export type DifferenceKind = "financial" | "operational";

export type DifferenceRow = {
  id: "collection" | "operational" | "transfer-v1";
  label: string;
  hint: string;
  value: number;
  kind: DifferenceKind;
};

/**
 * FIN-CLOSE-02: filas de diferencias de transferencias del comprobante.
 * - v2 (con `collectionDifference`): la conciliación financiera va primero; la
 *   comparación con ventas entregadas se rotula como operacional.
 * - v1 (sin libro): una sola fila, como se registró en su momento.
 * No cambia ningún campo persistido.
 */
export function transferDifferenceRows(
  close: Pick<CashCloseRecord, "transferDifference" | "collectionDifference">
): DifferenceRow[] {
  if (close.collectionDifference === undefined) {
    return [{
      id: "transfer-v1",
      label: "Diferencia transferencias (vs. entregadas)",
      hint: "Cierre anterior a la conciliación con el libro de pagos.",
      value: close.transferDifference,
      kind: "financial",
    }];
  }
  return [
    {
      id: "collection",
      label: "Conciliación con libro de pagos",
      hint: "Banco verificado − cobros confirmados en el sistema.",
      value: close.collectionDifference,
      kind: "financial",
    },
    {
      id: "operational",
      label: "Diferencia operacional vs. entregadas",
      hint: "Referencial: incluye pagos de pedidos aún no entregados o de otras jornadas. No es faltante bancario.",
      value: close.transferDifference,
      kind: "operational",
    },
  ];
}

/** Texto de una diferencia según su naturaleza. */
export function differenceLabel(value: number, kind: DifferenceKind): string {
  if (kind === "operational") return value === 0 ? "Coincide" : value > 0 ? "+" : "−";
  return value === 0 ? "Cuadra" : value < 0 ? "Faltante" : "Sobrante";
}

type Parsed = { ok: true; value: number } | { ok: false; message: string } | null;

export type CashCloseReadinessInput = {
  hasSummary: boolean;
  /** El último intento de recarga falló: el resumen en pantalla puede estar viejo. */
  summaryStale: boolean;
  ledgerConsistent: boolean | null;
  collectionsComplete: boolean;
  blockers: Pick<CashCloseBlocker, "code" | "displayCodes">[];
  counted: Parsed;
  transfers: Parsed;
  useOverride: boolean;
  overrideReason: string;
  differences: { cashDifference: number; collectionDifference: number } | null;
  discrepancyReason: string;
  discrepancyAcknowledged: boolean;
  ledgerSuggestionActive: boolean;
  bankVerified: boolean;
  busy: boolean;
};

export type CashCloseReadiness = {
  canSubmit: boolean;
  reasons: string[];
  /** false con pedidos activos: el override no los resuelve (servidor responde 409). */
  overrideAllowed: boolean;
  needsDiscrepancy: boolean;
};

function missing(text: string, min: number): number {
  return Math.max(0, min - text.trim().length);
}

/** CASH-CLOSE-UX-01: por qué "Cerrar caja" está deshabilitado, en palabras del operador. */
export function cashCloseReadiness(input: CashCloseReadinessInput): CashCloseReadiness {
  const reasons: string[] = [];
  const nonOverridable = input.blockers.filter((blocker) => NON_OVERRIDABLE.includes(blocker.code));
  const overridable = input.blockers.filter((blocker) => !NON_OVERRIDABLE.includes(blocker.code));
  const needsDiscrepancy = Boolean(
    input.differences
    && (input.differences.cashDifference !== 0 || input.differences.collectionDifference !== 0)
  );

  if (!input.hasSummary) {
    reasons.push("Cargando el resumen de la jornada.");
    return { canSubmit: false, reasons, overrideAllowed: false, needsDiscrepancy: false };
  }
  if (input.summaryStale) reasons.push("No se pudo actualizar el resumen: pulsa ↻ antes de cerrar.");
  if (input.ledgerConsistent === false) {
    reasons.push("El libro de pagos no coincide con su contador: revisa la auditoría antes de cerrar.");
  }
  if (!input.collectionsComplete) {
    reasons.push("La jornada supera el tope de eventos de pago verificables en un cierre.");
  }
  if (nonOverridable.length > 0) {
    const codes = nonOverridable.flatMap((blocker) => blocker.displayCodes).map((code) => `#${code}`);
    reasons.push(`Hay pedidos activos (${codes.join(", ")}): llévalos a entregado o cancelado. El override no aplica.`);
  }

  if (!input.counted) reasons.push("Ingresa el efectivo contado en CLP (0 si no hubo).");
  else if (!input.counted.ok) reasons.push("Corrige el efectivo contado.");
  if (!input.transfers) reasons.push("Ingresa las transferencias verificadas en el banco en CLP (0 si no hubo).");
  else if (!input.transfers.ok) reasons.push("Corrige el monto de transferencias.");

  if (overridable.length > 0 && nonOverridable.length === 0) {
    if (!input.useOverride) {
      reasons.push("Hay pagos pendientes o transferencias sin confirmar: márcalos con override administrativo.");
    } else {
      const left = missing(input.overrideReason, OVERRIDE_REASON_MIN);
      if (left > 0) reasons.push(`Escribe el motivo del override (faltan ${left} caracteres).`);
    }
  }

  if (input.ledgerSuggestionActive && !input.bankVerified) {
    reasons.push("Confirma que contrastaste con el banco el importe copiado del libro.");
  }

  if (needsDiscrepancy) {
    const left = missing(input.discrepancyReason, DISCREPANCY_REASON_MIN);
    if (left > 0) reasons.push(`Explica el motivo de la diferencia (faltan ${left} caracteres).`);
    if (!input.discrepancyAcknowledged) reasons.push("Confirma que cierras la caja con diferencia.");
  }

  return {
    canSubmit: reasons.length === 0 && !input.busy,
    reasons,
    overrideAllowed: nonOverridable.length === 0,
    needsDiscrepancy,
  };
}
