"use client";

import { useId, useReducer } from "react";
import { CircleHelp } from "lucide-react";
import { METRIC_HELP_INITIAL, metricHelpReducer } from "../../lib/metric-help";

/** Ayuda (ⓘ) de las tarjetas de Métricas. Estado y reglas: `lib/metric-help.ts`. */
export function MetricHelp({ label }: { label: string }) {
  // FIN-01 QA: ayuda alcanzable con teclado y anunciada por lectores de pantalla
  // (antes era un <span title> sin foco). Se muestra con hover, foco o toque;
  // Escape la oculta aunque siga el foco o el puntero (FIN-R05, lib/metric-help).
  const id = useId();
  const [{ open, dismissed }, dispatch] = useReducer(metricHelpReducer, METRIC_HELP_INITIAL);
  return (
    <span
      className="metric-help"
      data-open={open || undefined}
      data-dismissed={dismissed || undefined}
      onPointerLeave={() => dispatch("pointerleave")}
    >
      <button
        type="button"
        aria-label="Ayuda"
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => dispatch("toggle")}
        onBlur={() => dispatch("blur")}
        onKeyDown={(event) => { if (event.key === "Escape") dispatch("escape"); }}
        className="metric-help-button"
      >
        <CircleHelp aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
      <span role="tooltip" id={id} className="metric-help-tip">{label}</span>
    </span>
  );
}
