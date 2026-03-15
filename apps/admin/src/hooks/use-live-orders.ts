"use client";

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query
} from "firebase/firestore";
import { db } from "../lib/firebase/client";

export interface LiveOrder {
  id: string;
  status: string;
  fulfillmentType: "delivery" | "pickup";
  customer: {
    name: string;
    phone: string;
    address?: string;
    notes?: string;
  };
  totals: {
    subtotal: number;
    delivery: number;
    total: number;
  };
  createdAt?: unknown;
  updatedAt?: unknown;
}

export function useLiveOrders(tenantId: string) {
  const [orders, setOrders] = useState<LiveOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = collection(db, `tenants/${tenantId}/orders`);
    const q = query(ref, orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const nextOrders: LiveOrder[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<LiveOrder, "id">)
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
