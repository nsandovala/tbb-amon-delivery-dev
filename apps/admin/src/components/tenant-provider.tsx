"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { fetchMyMemberships, type MembershipSummary } from "@/lib/api/membership";
import { ACTIVE_TENANT_STORAGE_KEY } from "@/lib/tenant";

/**
 * SEC-BASE / H-04: contexto multi-tenant. Fuente de la verdad para el admin:
 *
 * - Tras `onAuthStateChanged`, consulta `listMyMemberships`.
 * - Si hay 1 membresía → se autoselecciona.
 * - Si hay varias → espera `setActiveTenant(id)`; valida que el id esté
 *   dentro de la lista devuelta (nunca acepta un ID arbitrario del cliente).
 * - Si hay 0 → cierra sesión y el guard envía a `/login`.
 * - El tenant seleccionado persiste en sessionStorage (vida de la pestaña).
 *
 * No se cachean memberships entre sesiones ni se trata una lista stale como
 * autoritativa: el revoke se reflejará en la próxima resolución tras
 * `permission-denied` (ver `handle-authz-loss.ts`).
 */

interface TenantContextValue {
  status:
    | "loading"
    | "authenticated"
    | "unauthenticated"
    | "no-memberships"
    | "error";
  uid: string | null;
  email: string | null;
  memberships: MembershipSummary[];
  activeTenant: MembershipSummary | null;
  errorMessage: string | null;
  setActiveTenant: (tenantId: string) => void;
  refresh: () => Promise<void>;
}

const TenantContext = createContext<TenantContextValue | null>(null);

function readStoredTenant(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(ACTIVE_TENANT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredTenant(tenantId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (tenantId) {
      window.sessionStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, tenantId);
    } else {
      window.sessionStorage.removeItem(ACTIVE_TENANT_STORAGE_KEY);
    }
  } catch {
    /* storage might be disabled; context sigue siendo válido en memoria */
  }
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<TenantContextValue["status"]>("loading");
  const [uid, setUid] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<MembershipSummary[]>([]);
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resolve = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) {
      setStatus("unauthenticated");
      setUid(null);
      setEmail(null);
      setMemberships([]);
      setActiveTenantId(null);
      setErrorMessage(null);
      writeStoredTenant(null);
      return;
    }

    try {
      const result = await fetchMyMemberships();
      setErrorMessage(null);
      if (!result) {
        // Backend respondió 401/403: la sesión del cliente está activa en
        // Firebase Auth pero el servidor rechazó el token (p. ej. revocado).
        setStatus("unauthenticated");
        setUid(null);
        setEmail(null);
        setMemberships([]);
        setActiveTenantId(null);
        writeStoredTenant(null);
        return;
      }
      setUid(result.uid);
      setEmail(result.email);
      setMemberships(result.memberships);

      if (result.memberships.length === 0) {
        setStatus("no-memberships");
        setActiveTenantId(null);
        writeStoredTenant(null);
        return;
      }

      const stored = readStoredTenant();
      const storedMatch = stored
        ? result.memberships.find((m) => m.tenantId === stored)
        : null;
      const chosen = storedMatch
        ? storedMatch
        : result.memberships.length === 1
          ? result.memberships[0]
          : null;
      if (chosen) {
        setActiveTenantId(chosen.tenantId);
        writeStoredTenant(chosen.tenantId);
      } else {
        setActiveTenantId(null);
      }
      setStatus("authenticated");
    } catch (err) {
      // Fallo transitorio: red, 5xx, DNS, etc. Mantenemos la sesión Firebase
      // activa, no limpiamos memberships previas (si existían, siguen siendo
      // la mejor aproximación), y marcamos "error" para que el guard muestre
      // retry sin redirigir a /login. Prevenimos el loop /login↔/pedidos.
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, () => {
      void resolve();
    });
    return unsub;
  }, [resolve]);

  const setActiveTenant = useCallback(
    (tenantId: string) => {
      const match = memberships.find((m) => m.tenantId === tenantId);
      if (!match) {
        throw new Error(`Tenant ${tenantId} is not in the authorized list.`);
      }
      setActiveTenantId(tenantId);
      writeStoredTenant(tenantId);
    },
    [memberships]
  );

  const activeTenant = useMemo(
    () => memberships.find((m) => m.tenantId === activeTenantId) ?? null,
    [memberships, activeTenantId]
  );

  const value = useMemo<TenantContextValue>(
    () => ({
      status,
      uid,
      email,
      memberships,
      activeTenant,
      errorMessage,
      setActiveTenant,
      refresh: resolve,
    }),
    [status, uid, email, memberships, activeTenant, errorMessage, setActiveTenant, resolve]
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenantContext(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error("useTenantContext must be used within <TenantProvider>");
  }
  return ctx;
}

/**
 * Hook de conveniencia para páginas que requieren un tenant activo. Lanza si
 * el contexto no está listo — fuerza al llamador a montarse debajo del guard.
 */
export function useActiveTenant(): MembershipSummary {
  const { activeTenant } = useTenantContext();
  if (!activeTenant) {
    throw new Error("No active tenant resolved. Mount under <AdminGuard>.");
  }
  return activeTenant;
}
