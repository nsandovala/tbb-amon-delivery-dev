"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../lib/firebase/client";
import type { AdminOrder } from "../lib/firebase/queries/orders";

export function useLiveOrders(tenantId: string) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const ref = collection(db, `tenants/${tenantId}/orders`);
    const q = query(ref, orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const nextOrders: AdminOrder[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<AdminOrder, "id">),
        }));

        setOrders(nextOrders);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error("Error leyendo pedidos live:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [tenantId]);

  return { orders, loading, error };
}
