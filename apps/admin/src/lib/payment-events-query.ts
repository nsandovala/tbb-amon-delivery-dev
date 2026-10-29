import { limit, orderBy, Timestamp, where, type QueryConstraint } from "firebase/firestore";

/**
 * PR #88 (P2-02, Codex) — rango de la consulta de `paymentEvents` de Métricas.
 *
 * Un período histórico (fin ya pasado) se acota arriba: sin ese límite, la
 * actividad posterior al período llenaba el tope de documentos y un período
 * pequeño y completo se mostraba "Incompleto".
 *
 * Un período en curso (fin = ahora) queda abierto: `nowMs` avanza cada 60 s y
 * usar ese fin en la consulta la volvería a suscribir cada minuto (lecturas
 * repetidas del período completo). Abierto, no hay eventos posteriores a
 * "ahora" que lo llenen, y `getTransferCollectionsInRange` sigue recortando
 * en `range.end`.
 */
export function paymentEventsUntilMs(rangeEndMs: number, nowMs: number): number | null {
  return rangeEndMs < nowMs ? rangeEndMs : null;
}

/**
 * `at >= since` y, si hay fin, `at < until + 1 ms`: incluye todo el último
 * milisegundo (p. ej. 23:59:59.999xxx de un período personalizado), igual que
 * el recorte en cliente, que compara en milisegundos. Rango y orderBy sobre
 * `at`: índice automático.
 */
export function paymentEventsRangeConstraints(sinceMs: number, untilMs: number | null, max: number): QueryConstraint[] {
  return [
    where("at", ">=", Timestamp.fromMillis(sinceMs)),
    ...(untilMs === null ? [] : [where("at", "<", Timestamp.fromMillis(untilMs + 1))]),
    orderBy("at", "asc"),
    limit(max + 1),
  ];
}
