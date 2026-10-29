/**
 * FIN-01 (auditoría FIN-A01..A03) — reglas puras de presentación del libro de pagos.
 *
 * - A01: un neto calculado sobre una lectura truncada NO es un total ni un
 *   mínimo garantizado (pueden faltar reversiones negativas). Nunca se muestra
 *   como monto ni se usa para conciliar.
 * - A02: un resultado de listener solo es "actual" si corresponde a la misma
 *   consulta (tenant + rango) que la pantalla pide ahora. Mientras tanto se
 *   informa "cargando", nunca cifras anteriores ni $0.
 * - A03: un historial con `complete: false` se declara parcial.
 */

type MaybeIncomplete = { net: number | null; complete: boolean } | null | undefined;

/** Neto apto para mostrar y conciliar, o null si la lectura está incompleta. */
export function reconcilableNet(collections: MaybeIncomplete): number | null {
  if (!collections || !collections.complete || collections.net === null) return null;
  return collections.net;
}

/**
 * Diferencia "transferencias verificadas en banco − cobros confirmados".
 * null cuando el libro está incompleto: no hay base válida para conciliar.
 * Sin libro (snapshot v1) se compara contra las transferencias entregadas.
 */
export function transferReconciliationDifference(
  verifiedTransfers: number,
  collections: MaybeIncomplete,
  expectedTransfersFallback: number
): number | null {
  if (!collections) return verifiedTransfers - expectedTransfersFallback;
  const net = reconcilableNet(collections);
  return net === null ? null : verifiedTransfers - net;
}

/**
 * Clave de la consulta en vivo del libro: tenant, inicio y fin (`null` =
 * período en curso, abierto; ver `payment-events-query.ts`). Cambiar
 * cualquiera invalida el resultado anterior.
 */
export function paymentEventsQueryKey(tenantId: string, sinceMs: number, untilMs: number | null = null): string {
  return `${tenantId}|${sinceMs}|${untilMs ?? "open"}`;
}

export type LiveQueryState<T> = {
  /** Consulta a la que pertenece este resultado (null: aún no llega ninguno). */
  key: string | null;
  data: T;
  complete: boolean;
  error: Error | null;
};

export type LiveQueryView<T> =
  | { status: "loading" }
  | { status: "error"; error: Error }
  | { status: "ready"; data: T; complete: boolean };

/** Resultado utilizable SOLO si pertenece a la consulta vigente. */
export function selectCurrentResult<T>(state: LiveQueryState<T>, currentKey: string): LiveQueryView<T> {
  if (state.key !== currentKey) return { status: "loading" };
  if (state.error) return { status: "error", error: state.error };
  return { status: "ready", data: state.data, complete: state.complete };
}

/** Aviso para un historial de pagos; null si está completo. */
export function paymentHistoryNotice(history: { events: unknown[]; complete: boolean }): string | null {
  return history.complete
    ? null
    : `Historial parcial: se muestran ${history.events.length} eventos y hay más registrados. No lo uses para conciliar este pedido.`;
}

/**
 * Contenido de la tarjeta "Cobros por transferencia confirmados" de Métricas.
 * Solo muestra un monto con una lectura de la consulta vigente, completa y
 * sin filtro de canal.
 */
export function transferCollectionsCard(
  view: LiveQueryView<unknown>["status"],
  collections: { net: number | null; complete: boolean; confirmedCount: number; revertedCount: number } | null,
  pendingTransferLabel: string,
  money: (value: number) => string
): { value: string; detail: string } {
  if (view === "loading") return { value: "…", detail: "Cargando libro de pagos del período" };
  if (view === "error") return { value: "—", detail: "Sin acceso al libro de pagos" };
  if (!collections) return { value: "—", detail: "No aplica con filtro de canal" };
  const net = reconcilableNet(collections);
  if (net === null) {
    return {
      value: "Incompleto",
      detail: "Más eventos que el tope de lectura: no hay total ni mínimo confiable. Usa el cierre de caja.",
    };
  }
  return {
    value: money(net),
    detail: `${collections.confirmedCount} confirmaciones · ${collections.revertedCount} reversos · ${pendingTransferLabel} sin confirmar`,
  };
}
