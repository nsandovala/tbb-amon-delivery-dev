import { auth } from "../firebase/client";

const USE_EMULATOR = process.env.NEXT_PUBLIC_USE_EMULATOR === "true";
const FUNCTIONS_BASE = USE_EMULATOR
  ? "/api/functions"
  : (process.env.NEXT_PUBLIC_FUNCTIONS_BASE_URL ??
    "http://127.0.0.1:5001/minerp-sentinel/us-central1");

export type MembershipRole = "owner" | "admin";

export interface MyMembership {
  uid: string;
  tenantId: string;
  role: MembershipRole;
  permissions: string[];
}

export interface MembershipSummary {
  tenantId: string;
  tenantName: string | null;
  role: MembershipRole;
  permissions: string[];
}

export interface MyMembershipsResponse {
  uid: string;
  email: string | null;
  memberships: MembershipSummary[];
}

/**
 * Consulta la membresía del usuario autenticado en el tenant indicado.
 * Devuelve `null` si el servidor rechaza con 401/403 (sin sesión o sin
 * membresía activa). Nunca persiste la respuesta en storage: cada carga
 * verifica contra el servidor para que la revocación sea efectiva.
 */
export async function fetchMyMembership(tenantId: string): Promise<MyMembership | null> {
  const user = auth.currentUser;
  if (!user) return null;

  const token = await user.getIdToken();
  const url = `${FUNCTIONS_BASE}/getMyMembership?tenantId=${encodeURIComponent(tenantId)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (res.status === 401 || res.status === 403) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Membership lookup failed with HTTP ${res.status}`);
  }
  const body = (await res.json()) as { ok: boolean; data?: MyMembership };
  if (!body.ok || !body.data) return null;
  return body.data;
}

/**
 * Devuelve todas las membresías activas del usuario autenticado. 401/403 →
 * `null` (sin sesión o token inválido). El cliente nunca inventa tenants:
 * la lista proviene siempre del servidor.
 */
export async function fetchMyMemberships(): Promise<MyMembershipsResponse | null> {
  const user = auth.currentUser;
  if (!user) return null;

  const token = await user.getIdToken();
  const url = `${FUNCTIONS_BASE}/listMyMemberships`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) {
    throw new Error(`Memberships lookup failed with HTTP ${res.status}`);
  }
  const body = (await res.json()) as { ok: boolean; data?: MyMembershipsResponse };
  if (!body.ok || !body.data) return null;
  return body.data;
}
