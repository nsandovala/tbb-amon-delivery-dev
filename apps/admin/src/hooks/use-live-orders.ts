"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../lib/firebase/client";
import type { AdminOrder } from "../lib/firebase/queries/orders";

export function useLiveOrders(tenantId: string) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);

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
        setLoading(false);
      },
      (error) => {
        console.error("Error leyendo pedidos live:", error);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [tenantId]);

  return { orders, loading };
}