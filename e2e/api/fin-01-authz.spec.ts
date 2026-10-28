import { test, expect, type APIRequestContext } from "@playwright/test";
import { initializeApp, deleteApp, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut, type Auth } from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Firestore,
  type FirestoreError,
} from "firebase/firestore";
import {
  FIRESTORE_DOCS,
  FIXTURE_PASSWORD,
  PROJECT_ID,
  bearer,
  createMembership,
  createOpenFixtureTenant,
  createUser,
  revokeMembership,
  writeFixtureDoc,
  type TestUser,
} from "../support/emulator-fixtures";
import {
  confirmTransfer,
  expectCode,
  payKey,
  revertTransfer,
  seedOrder,
  todayOperationalDate,
} from "../support/fin-01-fixtures";
import { OPERATION_PAYMENT_EVENTS_LIMIT } from "../../apps/admin/src/lib/operation-timeline";

/**
 * FIN-H02 — autorización de pagos en Functions y en reglas Firestore.
 *
 * - Functions: `payments.confirm_transfer` (confirmar/revertir) y `payments.view` (listar).
 * - Reglas: `paymentEvents` legible solo con `canViewPayments`; nunca escribible
 *   desde cliente. Tampoco `paymentStatus` del pedido ni `orderCounters`.
 * Las lecturas REST con ID token evalúan las reglas igual que el SDK cliente.
 */

test.describe.configure({ mode: "serial" });

let api: APIRequestContext;
let tenantA: string;
let ownerA: TestUser;
let ownerB: TestUser;
let orderId: string;
let total: number;
let confirmationEventId: string;

test.beforeAll(async ({ playwright, baseURL }) => {
  api = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { "Content-Type": "application/json" } });
  const a = await createOpenFixtureTenant(api, "fin01-authz-a");
  const b = await createOpenFixtureTenant(api, "fin01-authz-b");
  tenantA = a.tenantId;
  ownerA = a.owner;
  ownerB = b.owner;
  ({ orderId, total } = await seedOrder(api, tenantA, "fin01authzOrder00001"));
  const res = await expectCode(
    await confirmTransfer(api, ownerA.token, { tenantId: tenantA, orderId, expectedAmount: total, idempotencyKey: payKey() }),
    201
  );
  confirmationEventId = res.data.eventId;
});

test.afterAll(async () => {
  await api.dispose();
});

const readEvents = (token?: string) =>
  api.get(`${FIRESTORE_DOCS}/tenants/${tenantA}/paymentEvents`, { headers: token ? bearer(token) : {} });

test("owner y admin del tenant: confirmar, revertir, listar y leer el libro", async () => {
  const admin = await createUser(api, { label: "fin01-authz-admin" });
  await createMembership(api, { tenantId: tenantA, uid: admin.uid, role: "admin" });
  const other = await seedOrder(api, tenantA, "fin01authzAdmin00001");
  const confirmed = await expectCode(
    await confirmTransfer(api, admin.token, { tenantId: tenantA, orderId: other.orderId, expectedAmount: other.total, idempotencyKey: payKey() }),
    201
  );
  await expectCode(
    await revertTransfer(api, admin.token, {
      tenantId: tenantA, orderId: other.orderId, expectedConfirmationEventId: confirmed.data.eventId, reason: "prueba admin", idempotencyKey: payKey(),
    }),
    201
  );
  await expectCode(await api.get(`listPaymentEvents?tenantId=${tenantA}&orderId=${orderId}`, { headers: bearer(admin.token) }), 200);
  expect((await readEvents(admin.token)).status()).toBe(200);
  expect((await readEvents(ownerA.token)).status()).toBe(200);
});

test("owner de otro tenant: 403 en Functions y lectura denegada por reglas", async () => {
  await expectCode(
    await confirmTransfer(api, ownerB.token, { tenantId: tenantA, orderId, expectedAmount: total, idempotencyKey: payKey() }),
    403,
    "FORBIDDEN"
  );
  await expectCode(
    await revertTransfer(api, ownerB.token, {
      tenantId: tenantA, orderId, expectedConfirmationEventId: confirmationEventId, reason: "intento cruzado", idempotencyKey: payKey(),
    }),
    403,
    "FORBIDDEN"
  );
  await expectCode(await api.get(`listPaymentEvents?tenantId=${tenantA}&orderId=${orderId}`, { headers: bearer(ownerB.token) }), 403);
  // Un pedido inexistente en A tampoco se distingue: 403 antes de leer.
  await expectCode(
    await confirmTransfer(api, ownerB.token, { tenantId: tenantA, orderId: "noExiste000000000001", expectedAmount: 1, idempotencyKey: payKey() }),
    403
  );
  expect((await readEvents(ownerB.token)).status()).toBe(403);
  expect((await readDoc(`paymentEvents/${confirmationEventId}`, ownerB.token)).status()).toBe(403);
});

async function readDoc(path: string, token: string) {
  return api.get(`${FIRESTORE_DOCS}/tenants/${tenantA}/${path}`, { headers: bearer(token) });
}

test("membresía revocada: 403 y lectura denegada", async () => {
  const user = await createUser(api, { label: "fin01-authz-revoked" });
  await createMembership(api, { tenantId: tenantA, uid: user.uid, role: "admin" });
  expect((await readEvents(user.token)).status()).toBe(200);
  await revokeMembership(api, tenantA, user.uid);
  await expectCode(
    await confirmTransfer(api, user.token, { tenantId: tenantA, orderId, expectedAmount: total, idempotencyKey: payKey() }),
    403
  );
  await expectCode(await api.get(`listPaymentEvents?tenantId=${tenantA}&orderId=${orderId}`, { headers: bearer(user.token) }), 403);
  expect((await readEvents(user.token)).status()).toBe(403);
});

test("rol no reconocido: fail-closed en Functions y reglas", async () => {
  const user = await createUser(api, { label: "fin01-authz-cashier" });
  await writeFixtureDoc(api, `tenants/${tenantA}/members/${user.uid}`, {
    uid: user.uid, tenantId: tenantA, role: "cashier", status: "active", createdByUid: "system:e2e",
    createdAt: new Date().toISOString(),
  });
  await expectCode(
    await confirmTransfer(api, user.token, { tenantId: tenantA, orderId, expectedAmount: total, idempotencyKey: payKey() }),
    403
  );
  await expectCode(await api.get(`listPaymentEvents?tenantId=${tenantA}&orderId=${orderId}`, { headers: bearer(user.token) }), 403);
  expect((await readEvents(user.token)).status()).toBe(403);
});

test("sin token o token basura: 401; anónimo no lee el libro", async () => {
  await expectCode(
    await api.post("confirmTransferPayment", { data: { tenantId: tenantA, orderId, expectedAmount: total, idempotencyKey: payKey() } }),
    401
  );
  await expectCode(
    await api.post("revertTransferConfirmation", {
      headers: { Authorization: "Bearer basura" },
      data: { tenantId: tenantA, orderId, expectedConfirmationEventId: confirmationEventId, reason: "sin sesión", idempotencyKey: payKey() },
    }),
    401
  );
  await expectCode(await api.get(`listPaymentEvents?tenantId=${tenantA}&orderId=${orderId}`), 401);
  expect((await readEvents()).status()).toBe(403);
});

test("escrituras directas desde cliente (owner): libro, proyección y contador denegados", async () => {
  const today = todayOperationalDate();
  const write = (path: string, fields: Record<string, unknown>, mask?: string) =>
    api.patch(`${FIRESTORE_DOCS}/tenants/${tenantA}/${path}${mask ? `?updateMask.fieldPaths=${mask}` : ""}`, {
      headers: bearer(ownerA.token),
      data: { fields },
    });
  expect((await write("paymentEvents/forged00000000000001", { signedAmount: { integerValue: "999999" } })).status()).toBe(403);
  expect((await write(`orders/${orderId}`, { paymentStatus: { stringValue: "pending" } }, "paymentStatus")).status()).toBe(403);
  expect((await write(`orderCounters/${today}`, { lastDisplayOrderNumber: { integerValue: "0" } })).status()).toBe(403);
  const del = await api.delete(`${FIRESTORE_DOCS}/tenants/${tenantA}/paymentEvents/${confirmationEventId}`, {
    headers: bearer(ownerA.token),
  });
  expect(del.status()).toBe(403);
});

test("listener abierto sobre paymentEvents recibe permission-denied al revocar", async () => {
  const user = await createUser(api, { label: "fin01-authz-listener" });
  await createMembership(api, { tenantId: tenantA, uid: user.uid, role: "admin" });

  const app: FirebaseApp = initializeApp({ apiKey: "fake-api-key", projectId: PROJECT_ID }, `fin01-listener-${Date.now()}`);
  const auth: Auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const fs: Firestore = getFirestore(app);
  connectFirestoreEmulator(fs, "127.0.0.1", 8080);
  try {
    await signInWithEmailAndPassword(auth, user.email, FIXTURE_PASSWORD);
    let unsubscribe = () => {};
    const outcome = await new Promise<FirestoreError>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out waiting for permission-denied")), 20_000);
      let first = true;
      unsubscribe = onSnapshot(
        collection(fs, `tenants/${tenantA}/paymentEvents`),
        () => {
          if (!first) return;
          first = false;
          // Snapshot inicial autorizado; ahora se revoca y se provoca un cambio en el libro.
          void (async () => {
            await revokeMembership(api, tenantA, user.uid);
            const extra = await seedOrder(api, tenantA, `fin01authzLsn${Date.now().toString(36)}`.slice(0, 20));
            await confirmTransfer(api, ownerA.token, {
              tenantId: tenantA, orderId: extra.orderId, expectedAmount: extra.total, idempotencyKey: payKey(),
            });
          })().catch(reject);
        },
        (err) => {
          clearTimeout(timeout);
          resolve(err);
        }
      );
    });
    unsubscribe();
    expect(outcome.code).toBe("permission-denied");
  } finally {
    await signOut(auth).catch(() => {});
    await deleteApp(app).catch(() => {});
  }
});

/**
 * FIN-QA-02 — la consulta exacta de la bitácora de Operación
 * (`useRecentPaymentEvents`: orderBy(at desc) + limit(tope + 1)) solo la
 * resuelven roles con `payments.view`; el permiso que la UI usa para montarla
 * viene del servidor (`listMyMemberships`).
 */
test("bitácora de Operación: consulta acotada solo con payments.view", async () => {
  const admin = await createUser(api, { label: "fin01-authz-timeline-admin" });
  await createMembership(api, { tenantId: tenantA, uid: admin.uid, role: "admin" });
  const cashier = await createUser(api, { label: "fin01-authz-timeline-cashier" });
  await writeFixtureDoc(api, `tenants/${tenantA}/members/${cashier.uid}`, {
    uid: cashier.uid, tenantId: tenantA, role: "cashier", status: "active", createdByUid: "system:e2e",
    createdAt: new Date().toISOString(),
  });

  const memberships = await expectCode(await api.get("listMyMemberships", { headers: bearer(admin.token) }), 200);
  const entry = (memberships.data.memberships as Array<{ tenantId: string; permissions: string[] }>)
    .find((membership) => membership.tenantId === tenantA);
  expect(entry?.permissions).toContain("payments.view");

  const runTimelineQuery = async (user: TestUser) => {
    const app: FirebaseApp = initializeApp({ apiKey: "fake-api-key", projectId: PROJECT_ID }, `fin01-timeline-${user.uid}`);
    const auth: Auth = getAuth(app);
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    const fs: Firestore = getFirestore(app);
    connectFirestoreEmulator(fs, "127.0.0.1", 8080);
    try {
      await signInWithEmailAndPassword(auth, user.email, FIXTURE_PASSWORD);
      const snapshot = await getDocs(query(
        collection(fs, `tenants/${tenantA}/paymentEvents`),
        orderBy("at", "desc"),
        limit(OPERATION_PAYMENT_EVENTS_LIMIT + 1)
      ));
      return { ok: true as const, size: snapshot.size, first: snapshot.docs[0]?.data() };
    } catch (err) {
      return { ok: false as const, code: (err as FirestoreError).code };
    } finally {
      await signOut(auth).catch(() => {});
      await deleteApp(app).catch(() => {});
    }
  };

  const allowed = await runTimelineQuery(admin);
  expect(allowed.ok).toBe(true);
  if (allowed.ok) {
    expect(allowed.size).toBeGreaterThan(0);
    expect(allowed.size).toBeLessThanOrEqual(OPERATION_PAYMENT_EVENTS_LIMIT + 1);
    // Campos que la bitácora consume.
    expect(allowed.first).toMatchObject({ type: expect.any(String), orderId: expect.any(String), signedAmount: expect.any(Number) });
    expect(allowed.first?.actor).toMatchObject({ uid: expect.any(String) });
  }
  expect(await runTimelineQuery(ownerB)).toEqual({ ok: false, code: "permission-denied" });
  expect(await runTimelineQuery(cashier)).toEqual({ ok: false, code: "permission-denied" });
});
