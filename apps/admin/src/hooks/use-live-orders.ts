"use client";

import { useEffect, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../lib/firebase/client";
import {
  isAuthorizationLost,
  tearDownAuthorizedSession,
} from "../lib/auth/handle-authz-loss";
import type { AdminOrder } from "../lib/firebase/queries/orders";

/** Tope duro de documentos por listener: acota el costo aunque haya un bug aguas arriba. */
export const LIVE_ORDERS_HARD_LIMIT = 2000;

export type LiveOrdersOptions = {
  /** Solo pedidos con createdAt >= sinceMs (epoch ms). Obligatorio: nunca escuchar la colección completa. */
  sinceMs: number;
  /** Máximo de documentos; se recorta a LIVE_ORDERS_HARD_LIMIT. */
  max: number;
};

export function useLiveOrders(tenantId: string, { sinceMs, max }: LiveOrdersOptions) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const ref = collection(db, `tenants/${tenantId}/orders`);
    // Rango + orderBy sobre el mismo campo: no requiere índice compuesto.
    const q = query(
      ref,
      where("createdAt", ">=", Timestamp.fromMillis(sinceMs)),
      orderBy("createdAt", "desc"),
      limit(Math.min(Math.max(1, max), LIVE_ORDERS_HARD_LIMIT))
    );

    let active = true;
    let unsub: Unsubscribe = () => {};
    unsub = onSnapshot(
      q,
      (snapshot) => {
        if (!active) return;
        const nextOrders: AdminOrder[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<AdminOrder, "id">),
        }));

        setOrders(nextOrders);
        setError(null);
        setLoading(false);
      },
      (err) => {
        if (!active) return;
        if (isAuthorizationLost(err)) {
          active = false;
          unsub();
          setOrders([]);
          setLoading(false);
          void tearDownAuthorizedSession();
          return;
        }
        console.error("Error leyendo pedidos live:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => {
      active = false;
      unsub();
    };
  }, [tenantId, sinceMs, max]);

  return { orders, loading, error };
}
