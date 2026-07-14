"use client";

import { useEffect, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "../lib/firebase/client";
import type { AdminExpense } from "../lib/firebase/queries/expenses";

/**
 * Live read of tenants/{tenantId}/expenses.
 *
 * Reads go straight to Firestore because rules already restrict expenses to
 * admins. Writes must go through the createExpense Function.
 *
 * Ordered by occurredAt because an operator can backdate an expense they log
 * late, so createdAt would not reflect the operational timeline.
 */
export function useLiveExpenses(tenantId: string, max?: number) {
  const [expenses, setExpenses] = useState<AdminExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const ref = collection(db, `tenants/${tenantId}/expenses`);
    const constraints: QueryConstraint[] = [orderBy("occurredAt", "desc")];

    if (typeof max === "number") {
      constraints.push(limit(max));
    }

    const q = query(ref, ...constraints);

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const nextExpenses: AdminExpense[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<AdminExpense, "id">),
        }));

        setExpenses(nextExpenses);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error("Error leyendo gastos live:", err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [tenantId, max]);

  return { expenses, loading, error };
}
