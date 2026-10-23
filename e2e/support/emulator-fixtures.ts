import { expect, type APIRequestContext } from "@playwright/test";

/**
 * Fixtures aislados para pruebas API contra el emulador.
 *
 * - Cada suite crea su propio tenant `e2e-<suite>-<id>`; nunca toca `tbb`.
 * - Los documentos fixture se escriben con el token `owner` del emulador de
 *   Firestore (bypassa rules; solo existe en el emulador).
 * - Los usuarios admin se crean en el emulador de Auth con claim `admin: true`.
 */

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? "minerp-sentinel";
const FIRESTORE_DOCS = `http://127.0.0.1:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const AUTH_BASE = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const OWNER = { Authorization: "Bearer owner" };

type FirestoreValue = Record<string, unknown>;

function encodeValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
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

function encodeFields(data: Record<string, unknown>): Record<string, FirestoreValue> {
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
): Promise<string> {
  const res = await request.post(`${AUTH_BASE}/accounts:signUp?key=fake-api-key`, {
    data: { email, password, returnSecureToken: true },
  });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()).localId as string;
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

/** Crea un usuario en el emulador de Auth y devuelve su ID token. */
export async function createUserToken(
  request: APIRequestContext,
  options: { admin: boolean; label: string }
): Promise<{ token: string; email: string }> {
  const email = `${options.label}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@e2e.amon.test`;
  const password = "e2e-password-123";
  const localId = await signUp(request, email, password);

  if (options.admin) {
    const res = await request.post(
      `${AUTH_BASE}/projects/${PROJECT_ID}/accounts:update`,
      {
        headers: OWNER,
        data: { localId, customAttributes: JSON.stringify({ admin: true }) },
      }
    );
    expect(res.status(), await res.text()).toBe(200);
  }

  // Re-login para que el token incluya los custom claims.
  return { token: await signIn(request, email, password), email };
}

export function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** Tenant fixture con horario 17:30–22:30 y apertura manual: acepta pedidos a cualquier hora. */
export async function createOpenFixtureTenant(
  request: APIRequestContext,
  suite: string
): Promise<{ tenantId: string; adminToken: string }> {
  const tenantId = await createFixtureTenant(request, suite);
  const { token } = await createUserToken(request, { admin: true, label: suite });

  const control = await request.get(`getStoreControl?tenantId=${tenantId}`, {
    headers: bearer(token),
  });
  expect(control.status(), await control.text()).toBe(200);
  const { defaultConfig } = (await control.json()).data;

  const hours = await request.post("updateStoreHours", {
    headers: bearer(token),
    data: { tenantId, config: defaultConfig, reason: "fixture" },
  });
  expect(hours.status(), await hours.text()).toBe(200);

  const open = await request.post("setStoreOperation", {
    headers: bearer(token),
    data: { tenantId, action: "open", reason: "fixture e2e" },
  });
  expect(open.status(), await open.text()).toBe(200);

  return { tenantId, adminToken: token };
}
