/**
 * FIN-R05 — Estado de la ayuda (ⓘ) de Métricas.
 *
 * La ayuda se ve con hover, con foco de teclado (`:focus-visible`) o abierta
 * con clic/toque. `dismissed` registra un Escape (o un clic que la cierra) y
 * apaga también hover y foco hasta que el usuario se va: sin él, `:focus-within`
 * la mantenía visible después de Escape. Reglas CSS en `globals.css`
 * (`.metric-help`).
 */

export type MetricHelpState = { open: boolean; dismissed: boolean };

export type MetricHelpEvent = "toggle" | "escape" | "blur" | "pointerleave";

export const METRIC_HELP_INITIAL: MetricHelpState = { open: false, dismissed: false };

export function metricHelpReducer(state: MetricHelpState, event: MetricHelpEvent): MetricHelpState {
  switch (event) {
    case "toggle":
      return state.open ? { open: false, dismissed: true } : { open: true, dismissed: false };
    case "escape":
      return { open: false, dismissed: true };
    case "blur":
      // Literal (no METRIC_HELP_INITIAL): la prueba de navegador inyecta esta
      // función autocontenida en su harness.
      return { open: false, dismissed: false };
    case "pointerleave":
      return state.dismissed ? { ...state, dismissed: false } : state;
  }
}
