"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StoreStatus } from "@/lib/api/store";

const POLL_MS = 20_000;

/**
 * Polls a store-status source and keeps a 1s clock corrected by the server
 * skew (localNow from Functions), so countdowns don't trust the device clock.
 */
export function usePolledStoreStatus<T extends { status: StoreStatus } | StoreStatus>(
  load: () => Promise<T>,
  pollMs = POLL_MS
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const skewRef = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const refresh = useCallback(async () => {
    try {
      const next = await loadRef.current();
      const status: StoreStatus =
        "status" in next ? (next as { status: StoreStatus }).status : (next as StoreStatus);
      const serverNow = Date.parse(status.localNow);
      if (!Number.isNaN(serverNow)) skewRef.current = serverNow - Date.now();
      setData(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer el estado de la tienda.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const poll = window.setInterval(() => void refresh(), pollMs);
    const tick = window.setInterval(() => setNowMs(Date.now() + skewRef.current), 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [refresh, pollMs]);

  return { data, error, nowMs, refresh };
}
