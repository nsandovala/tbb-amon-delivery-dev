"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase/client";
import { getHumanOrderCode } from "../lib/orders";

/**
 * FIN-QA-02 — código humano (#042) de los pedidos que aparecen en la bitácora.
 *
 * Los eventos de pago guardan solo `orderId`. Se lee cada pedido una vez
 * (solo los visibles en la bitácora, con caché por tenant) y se extrae
 * únicamente el correlativo: ningún dato del cliente sale de este hook.
 */
export function useOrderCodes(tenantId: string, orderIds: readonly string[]): ReadonlyMap<string, string> {
  const [cache, setCache] = useState<{ tenantId: string; codes: Map<string, string> }>(
    () => ({ tenantId, codes: new Map() })
  );
  const codes = cache.tenantId === tenantId ? cache.codes : null;
  const missing = orderIds.filter((id) => !codes?.has(id));
  const missingKey = Array.from(new Set(missing)).sort().join(",");

  useEffect(() => {
    if (!missingKey) return;
    let active = true;
    const ids = missingKey.split(",");
    void Promise.all(
      ids.map(async (orderId) => {
        try {
          const snapshot = await getDoc(doc(db, `tenants/${tenantId}/orders/${orderId}`));
          if (!snapshot.exists()) return [orderId, "S/C"] as const;
          const data = snapshot.data() as { displayCode?: string; displayOrderNumber?: number };
          return [orderId, getHumanOrderCode({ id: orderId, displayCode: data.displayCode, displayOrderNumber: data.displayOrderNumber })] as const;
        } catch {
          return [orderId, "S/C"] as const;
        }
      })
    ).then((resolved) => {
      if (!active) return;
      setCache((current) => {
        const base = current.tenantId === tenantId ? current.codes : new Map<string, string>();
        const next = new Map(base);
        for (const [orderId, code] of resolved) next.set(orderId, code);
        return { tenantId, codes: next };
      });
    });
    return () => {
      active = false;
    };
  }, [tenantId, missingKey]);

  return codes ?? new Map();
}
