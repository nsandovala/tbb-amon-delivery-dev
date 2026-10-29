import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MetricHelp } from "@/components/metrics/metric-help";

/**
 * FIN-R05 — la ayuda (ⓘ) REAL de Métricas con el CSS real del admin, entre dos
 * controles para recorrerla con Tab. No necesita emuladores.
 */
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <main style={{ padding: 48 }}>
      <button type="button">Antes</button>
      <p className="metric-label" style={{ margin: "24px 0" }}>
        Cobros confirmados<MetricHelp label="Transferencias confirmadas en el libro de pagos." />
      </p>
      <button type="button">Después</button>
    </main>
  </StrictMode>
);
