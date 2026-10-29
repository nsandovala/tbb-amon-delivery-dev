import { randomUUID } from "node:crypto";
import { expect, type APIRequestContext } from "@playwright/test";

/**
 * Fixtures aislados para pruebas API contra el emulador.
 *
 * - Cada suite crea su propio tenant `e2e-<suite>-<id>`; nunca toca `tbb`.
 * - Los documentos fixture (incluidas membresías) se escriben con el token
 *   `owner` del emulador de Firestore, que bypassa rules solo en emulador.
 * - La autorización real pasa por `tenants/{tenantId}/members/{uid}` tras
 *   SEC-BASE. Los helpers crean esa membresía explícitamente; los tests
 *   negativos verifican qué ocurre cuando falta o está revocada.
 */

export const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? "minerp-sentinel";
export const FIRESTORE_DOCS = `http://127.0.0.1:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const AUTH_BASE = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const OWNER = { Authorization: "Bearer owner" };

type FirestoreValue = Record<string, unknown>;

/**
 * Timestamp de Firestore para un fixture, en RFC 3339 con hasta nanosegundos
 * (p. ej. `2026-01-11T02:59:59.999500Z`). Un `Date` también se acepta (ms).
 */
export class FixtureTimestamp {
  constructor(readonly iso: string) {}
}

function encodeValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (value instanceof FixtureTimestamp) return { timestampValue: value.iso };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === "object") {
    return { mapValue: { fields: encodeFields(value as Record<string, unknown>) } };
  }
  throw new Error(`Unsupported fixture value: ${String(value)}`);
}

export function encodeFields(data: Record<string, unknown>): Record<string, FirestoreValue> {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encodeValue(value)]));
}

/** Escribe (crea o reemplaza) un documento fixture. `path` relativo a la raíz. */
export async function writeFixtureDoc(
  request: APIRequestContext,
  path: string,
  data: Record<string, unknown>
): Promise<void> {
  const res = await request.patch(`${FIRESTORE_DOCS}/${path}`, {
    headers: OWNER,
    data: { fields: encodeFields(data) },
  });
  expect(res.status(), await res.text()).toBe(200);
}

/** Actualiza solo los campos indicados de un documento fixture. */
export async function patchFixtureDoc(
  request: APIRequestContext,
  path: string,
  data: Record<string, unknown>
): Promise<void> {
  const mask = Object.keys(data)
    .map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`)
    .join("&");
  const res = await request.patch(`${FIRESTORE_DOCS}/${path}?${mask}`, {
    headers: OWNER,
    data: { fields: encodeFields(data) },
  });
  expect(res.status(), await res.text()).toBe(200);
}

export function uniqueTenantId(suite: string): string {
  return `e2e-${suite}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export const FIXTURE_PRODUCT = {
  id: "e2e-burger",
  name: "E2E Burger",
  price: 6500,
  isActive: true,
};

/** Tenant fixture con un producto. Sin horario: queda fail-closed hasta configurarlo. */
export async function createFixtureTenant(
  request: APIRequestContext,
  suite: string
): Promise<string> {
  const tenantId = uniqueTenantId(suite);
  await writeFixtureDoc(request, `tenants/${tenantId}`, {
    id: tenantId,
    name: `Fixture ${suite}`,
    fixture: true,
  });
  await writeFixtureDoc(request, `tenants/${tenantId}/products/${FIXTURE_PRODUCT.id}`, {
    ...FIXTURE_PRODUCT,
    tenantId,
  });
  return tenantId;
}

async function signUp(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<{ localId: string; idToken: string }> {
  const res = await request.post(`${AUTH_BASE}/accounts:signUp?key=fake-api-key`, {
    data: { email, password, returnSecureToken: true },
  });
  expect(res.status(), await res.text()).toBe(200);
  const body = await res.json();
  return { localId: body.localId as string, idToken: body.idToken as string };
}

async function signIn(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<string> {
  const res = await request.post(`${AUTH_BASE}/accounts:signInWithPassword?key=fake-api-key`, {
    data: { email, password, returnSecureToken: true },
  });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()).idToken as string;
}

async function setLegacyAdminClaim(
  request: APIRequestContext,
  localId: string
): Promise<void> {
  const res = await request.post(
    `${AUTH_BASE}/projects/${PROJECT_ID}/accounts:update`,
    {
      headers: OWNER,
      data: { localId, customAttributes: JSON.stringify({ admin: true }) },
    }
  );
  expect(res.status(), await res.text()).toBe(200);
}

/**
 * Opciones de creación de usuario de prueba. El flag `legacyAdminClaim` solo
 * se usa en pruebas negativas para confirmar que `admin:true` ya no concede
 * acceso. En flujos felices se omite y la autorización depende de membresía.
 */
export interface CreateUserOptions {
  label: string;
  legacyAdminClaim?: boolean;
}

/** Contraseña de los usuarios fixture (solo emulador de Auth). */
export const FIXTURE_PASSWORD = "e2e-password-123";

export interface TestUser {
  uid: string;
  email: string;
  token: string;
}

/** Crea un usuario en el emulador de Auth y devuelve su UID + ID token. */
export async function createUser(
  request: APIRequestContext,
  options: CreateUserOptions
): Promise<TestUser> {
  const email = `${options.label}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@e2e.amon.test`;
  const password = FIXTURE_PASSWORD;
  const { localId, idToken } = await signUp(request, email, password);

  if (options.legacyAdminClaim) {
    await setLegacyAdminClaim(request, localId);
    // Re-login para que el token incluya los custom claims legados.
    const freshToken = await signIn(request, email, password);
    return { uid: localId, email, token: freshToken };
  }
  return { uid: localId, email, token: idToken };
}

export type MembershipRole = "owner" | "admin";
export type MembershipStatus = "active" | "revoked";

/**
 * Crea una membresía `tenants/{tenantId}/members/{uid}` vía Firestore REST
 * con token `owner` del emulador. En tests reales el bootstrap pasa por
 * Admin SDK; acá bypasseamos rules porque es solo preparación de fixture.
 */
export async function createMembership(
  request: APIRequestContext,
  options: {
    tenantId: string;
    uid: string;
    role: MembershipRole;
    status?: MembershipStatus;
    createdByUid?: string;
  }
): Promise<void> {
  const { tenantId, uid, role } = options;
  const status: MembershipStatus = options.status ?? "active";
  const createdByUid = options.createdByUid ?? "system:e2e";
  await writeFixtureDoc(request, `tenants/${tenantId}/members/${uid}`, {
    uid,
    tenantId,
    role,
    status,
    createdByUid,
    createdAt: new Date().toISOString(),
  });
}

/** Revoca una membresía existente actualizando su estado. */
export async function revokeMembership(
  request: APIRequestContext,
  tenantId: string,
  uid: string
): Promise<void> {
  await patchFixtureDoc(request, `tenants/${tenantId}/members/${uid}`, {
    status: "revoked",
    revokedAt: new Date().toISOString(),
    revokedByUid: "system:e2e",
  });
}

/** ORDER-IDEMPOTENCY: clave aleatoria nueva por intento de compra (createOrder/createPosSale). */
export function newIdempotencyKey(): string {
  return randomUUID();
}

export function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Tenant fixture con horario 17:30–22:30, abierto manualmente y un owner con
 * membresía activa. Devuelve también el token del owner para que el test
 * ejerza operaciones privadas.
 */
export async function createOpenFixtureTenant(
  request: APIRequestContext,
  suite: string
): Promise<{ tenantId: string; owner: TestUser }> {
  const tenantId = await createFixtureTenant(request, suite);
  const owner = await createUser(request, { label: `${suite}-owner` });
  await createMembership(request, {
    tenantId,
    uid: owner.uid,
    role: "owner",
  });

  const control = await request.get(`getStoreControl?tenantId=${tenantId}`, {
    headers: bearer(owner.token),
  });
  expect(control.status(), await control.text()).toBe(200);
  const { defaultConfig } = (await control.json()).data;

  const hours = await request.post("updateStoreHours", {
    headers: bearer(owner.token),
    data: { tenantId, config: defaultConfig, reason: "fixture" },
  });
  expect(hours.status(), await hours.text()).toBe(200);

  const open = await request.post("setStoreOperation", {
    headers: bearer(owner.token),
    data: { tenantId, action: "open", reason: "fixture e2e" },
  });
  expect(open.status(), await open.text()).toBe(200);

  return { tenantId, owner };
}

/** Documentos de una colección fixture (token `owner` del emulador). */
export async function listFixtureDocs(
  request: APIRequestContext,
  collectionPath: string
): Promise<{ name: string; fields: Record<string, unknown> }[]> {
  const res = await request.get(`${FIRESTORE_DOCS}/${collectionPath}?pageSize=300`, { headers: OWNER });
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()).documents ?? []) as { name: string; fields: Record<string, unknown> }[];
}

/** Producto fixture adicional en un tenant existente. */
export async function createFixtureProduct(
  request: APIRequestContext,
  tenantId: string,
  product: { id: string; name: string; price: number }
): Promise<void> {
  await writeFixtureDoc(request, `tenants/${tenantId}/products/${product.id}`, {
    ...product,
    isActive: true,
    tenantId,
  });
}
