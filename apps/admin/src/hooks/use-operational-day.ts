"use client";

import { useEffect, useState } from "react";
import { getOperationalDayStart } from "../lib/time";

/**
 * Inicio del día operativo actual, en milisegundos.
 *
 * Se recalcula cada minuto y al volver a la pestaña, pero solo cambia de valor
 * cuando se cruza el corte. Así una tablet abierta toda la noche rota sola al
 * día nuevo sin re-suscribir listeners en cada tick.
 */
export function useOperationalDayStartMs(): number {
  const [startMs, setStartMs] = useState(() => getOperationalDayStart(new Date()).getTime());

  useEffect(() => {
    const refresh = () => {
      const next = getOperationalDayStart(new Date()).getTime();
      setStartMs((current) => (current === next ? current : next));
    };
    const intervalId = window.setInterval(refresh, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return startMs;
}
