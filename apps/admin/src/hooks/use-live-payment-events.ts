"use client";

import { useEffect, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase/client";
import { MAX_PAYMENT_EVENTS_PER_DAY, type LedgerEvent } from "../lib/payment-ledger";
import { paymentEventsRangeConstraints } from "../lib/payment-events-query";
import {
  paymentEventsQueryKey,
  selectCurrentResult,
  type LiveQueryState,
  type LiveQueryView,
} from "../lib/payment-presentation";
import {
  OPERATION_PAYMENT_EVENTS_LIMIT,
  toTimelinePayment,
  type TimelinePaymentEvent,
} from "../lib/operation-timeline";

/**
 * FIN-01 — libro `paymentEvents` en vivo para Métricas (reglas: `payments.view`).
 *
 * - FIN-Q01/A01: se piden `tope + 1` documentos. Si llegan más que el tope,
 *   `complete: false` y la pantalla NO presenta ningún importe.
 * - FIN-A02: cada resultado queda etiquetado con la consulta (tenant, inicio y
 *   fin) que lo produjo. Tras un cambio, la vista es `loading` hasta que llega el
 *   snapshot de la consulta nueva: nunca cifras anteriores ni un $0 prematuro.
 * - PR #88 (P2-02): `untilMs` acota arriba los períodos históricos; `null`
 *   (período en curso) deja la consulta abierta para no resuscribirla cada
 *   vez que avanza el reloj de la pantalla. Ver `lib/payment-events-query.ts`.
 * - Sin permiso (`permission-denied`) devuelve `error` sin derribar la sesión:
 *   el listener de pedidos ya gobierna la pérdida de membresía.
 */
export const LIVE_PAYMENT_EVENTS_LIMIT = MAX_PAYMENT_EVENTS_PER_DAY;

export type LivePaymentEvent = LedgerEvent & { id: string; at?: Timestamp };

const EMPTY: LiveQueryState<LivePaymentEvent[]> = { key: null, data: [], complete: true, error: null };
const EMPTY_TIMELINE: LiveQueryState<TimelinePaymentEvent[]> = { key: null, data: [], complete: true, error: null };

export function useLivePaymentEvents(
  tenantId: string,
  sinceMs: number,
  untilMs: number | null
): LiveQueryView<LivePaymentEvent[]> {
  const [state, setState] = useState<LiveQueryState<LivePaymentEvent[]>>(EMPTY);
  const currentKey = paymentEventsQueryKey(tenantId, sinceMs, untilMs);

  useEffect(() => {
    const key = paymentEventsQueryKey(tenantId, sinceMs, untilMs);
    const q = query(
      collection(db, `tenants/${tenantId}/paymentEvents`),
      ...paymentEventsRangeConstraints(sinceMs, untilMs, LIVE_PAYMENT_EVENTS_LIMIT)
    );

    let active = true;
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        if (!active) return;
        const rows = snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as LedgerEvent) }));
        setState({
          key,
          data: rows.slice(0, LIVE_PAYMENT_EVENTS_LIMIT),
          complete: rows.length <= LIVE_PAYMENT_EVENTS_LIMIT,
          error: null,
        });
      },
      (err) => {
        if (!active) return;
        setState({ key, data: [], complete: false, error: err });
      }
    );

    return () => {
      active = false;
      unsub();
    };
  }, [tenantId, sinceMs, untilMs]);

  return selectCurrentResult(state, currentKey);
}

/**
 * FIN-QA-02 — últimos eventos del libro para la bitácora de Operación.
 *
 * - `enabled` debe ser `canReadPaymentLedger(permissions)`: sin `payments.view`
 *   no se abre ninguna consulta y devuelve null.
 * - `orderBy(at desc)` + `limit(tope + 1)`: índice automático, lectura acotada.
 *   Si llegan más que el tope, `complete: false`.
 * - Igual que FIN-A02: el resultado se etiqueta con el tenant y solo se entrega
 *   si coincide con el tenant vigente.
 */
export function useRecentPaymentEvents(
  tenantId: string,
  enabled: boolean
): LiveQueryView<TimelinePaymentEvent[]> | null {
  const [state, setState] = useState<LiveQueryState<TimelinePaymentEvent[]>>(EMPTY_TIMELINE);
  const currentKey = `${tenantId}|recent`;

  useEffect(() => {
    if (!enabled) return;
    const key = `${tenantId}|recent`;
    const q = query(
      collection(db, `tenants/${tenantId}/paymentEvents`),
      orderBy("at", "desc"),
      limit(OPERATION_PAYMENT_EVENTS_LIMIT + 1)
    );

    let active = true;
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        if (!active) return;
        const rows = snapshot.docs
          .map((doc) => toTimelinePayment({ ...doc.data(), id: doc.id }))
          .filter((row): row is TimelinePaymentEvent => row !== null);
        setState({
          key,
          data: rows.slice(0, OPERATION_PAYMENT_EVENTS_LIMIT),
          complete: snapshot.docs.length <= OPERATION_PAYMENT_EVENTS_LIMIT,
          error: null,
        });
      },
      (err) => {
        if (!active) return;
        setState({ key, data: [], complete: false, error: err });
      }
    );

    return () => {
      active = false;
      unsub();
    };
  }, [tenantId, enabled]);

  return enabled ? selectCurrentResult(state, currentKey) : null;
}
