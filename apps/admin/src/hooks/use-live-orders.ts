"use client";

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../lib/firebase/client";
import {
  isAuthorizationLost,
  tearDownAuthorizedSession,
} from "../lib/auth/handle-authz-loss";
import type { AdminOrder } from "../lib/firebase/queries/orders";

export function useLiveOrders(tenantId: string) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const ref = collection(db, `tenants/${tenantId}/orders`);
    const q = query(ref, orderBy("createdAt", "desc"));

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
  }, [tenantId]);

  return { orders, loading, error };
}
