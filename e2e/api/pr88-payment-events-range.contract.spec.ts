import { test, expect, type APIRequestContext } from "@playwright/test";
import { initializeApp, deleteApp, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut } from "firebase/auth";
import {
  collection,
  connectFirestoreEmulator,
  getDocs,
  getFirestore,
  query,
  type FirestoreError,
  type Timestamp,
} from "firebase/firestore";
import {
  FIXTURE_PASSWORD,
  FixtureTimestamp,
  PROJECT_ID,
  createOpenFixtureTenant,
  createUser,
  writeFixtureDoc,
  type TestUser,
} from "../support/emulator-fixtures";
import { commitFixtureDocs } from "../support/fin-01-fixtures";
import { paymentEventsRangeConstraints, paymentEventsUntilMs } from "../../apps/admin/src/lib/payment-events-query";
import { MAX_PAYMENT_EVENTS_PER_DAY } from "../../apps/admin/src/lib/payment-ledger";
import { getTransferCollectionsInRange } from "../../apps/admin/src/lib/metrics";

/**
 * PR #88 (P2-02, Codex) — consulta de `paymentEvents` de Métricas en un
 * período histórico, ejecutada con el SDK cliente y las reglas reales
 * (`payments.view`) contra el emulador. Mismas restricciones que el hook
 * (`paymentEventsRangeConstraints`) y mismo recorte que la pantalla
 * (`getTransferCollectionsInRange`).
 */

const LIMIT = MAX_PAYMENT_EVENTS_PER_DAY;
// Período personalizado histórico: 10-01-2026 en Santiago (UTC−3), fin inclusivo .999.
const RANGE = { start: new Date("2026-01-10T03:00:00.000Z"), end: new Date("2026-01-11T02:59:59.999Z") };

let api: APIRequestContext;

test.beforeAll(async ({ playwright, baseURL }) => {
  api = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { "Content-Type": "application/json" } });
});

test.afterAll(async () => {
  await api.dispose();
});

const event = (tenantId: string, id: string, at: Date | FixtureTimestamp, signedAmount = 100) => ({
  path: `tenants/${tenantId}/paymentEvents/${id}`,
  data: { tenantId, orderId: `o-${id}`, type: "transfer_confirmed", signedAmount, effectiveOperationalDate: "2026-01-10", originOperationalDate: "2026-01-10", at },
});

const after = (tenantId: string, count: number) =>
  Array.from({ length: count }, (_, i) =>
    event(tenantId, `after${String(i).padStart(6, "0")}`, new Date(Date.UTC(2026, 0, 12, 12, 0, i % 60, i)), 1));

/** Corre la consulta de Métricas como `user` y la resume como la pantalla. */
async function runMetricsQuery(user: TestUser, tenantId: string, untilMs: number | null) {
  const app: FirebaseApp = initializeApp({ apiKey: "fake-api-key", projectId: PROJECT_ID }, `pr88-${user.uid}-${untilMs}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const fs = getFirestore(app);
  connectFirestoreEmulator(fs, "127.0.0.1", 8080);
  try {
    await signInWithEmailAndPassword(auth, user.email, FIXTURE_PASSWORD);
    const snapshot = await getDocs(query(
      collection(fs, `tenants/${tenantId}/paymentEvents`),
      ...paymentEventsRangeConstraints(RANGE.start.getTime(), untilMs, LIMIT)
    ));
    const rows = snapshot.docs.map((doc) => doc.data() as { type: string; signedAmount: number; at: Timestamp });
    const complete = rows.length <= LIMIT;
    const collections = getTransferCollectionsInRange(
      rows.slice(0, LIMIT).map((row) => ({ type: row.type, signedAmount: row.signedAmount, at: row.at.toDate() })),
      RANGE,
      complete,
      "all"
    );
    return { ok: true as const, size: snapshot.size, collections };
  } catch (err) {
    return { ok: false as const, code: (err as FirestoreError).code };
  } finally {
    await signOut(auth).catch(() => {});
    await deleteApp(app).catch(() => {});
  }
}

const historicalUntil = () => paymentEventsUntilMs(RANGE.end.getTime(), Date.now());

test("período histórico con pocos eventos y más de 500 posteriores: completo y con neto", async () => {
  const { tenantId, owner } = await createOpenFixtureTenant(api, "pr88-range-few");
  await commitFixtureDocs(api, [
    event(tenantId, "in1", new Date("2026-01-10T15:00:00.000Z"), 1000),
    event(tenantId, "in2", new Date("2026-01-10T20:00:00.000Z"), 2000),
    event(tenantId, "in3", new Date("2026-01-11T01:00:00.000Z"), 4000),
    ...after(tenantId, LIMIT + 1),
  ]);

  expect(historicalUntil()).toBe(RANGE.end.getTime());
  const bounded = await runMetricsQuery(owner, tenantId, historicalUntil());
  expect(bounded).toEqual({
    ok: true,
    size: 3,
    collections: { net: 7000, confirmedCount: 3, revertedCount: 0, complete: true },
  });

  // Antes de la corrección (consulta abierta): la actividad posterior llenaba el tope.
  const open = await runMetricsQuery(owner, tenantId, null);
  expect(open).toMatchObject({ ok: true, size: LIMIT + 1, collections: { net: null, complete: false } });
});

test("más de 500 eventos dentro del período: Incompleto y sin neto", async () => {
  const { tenantId, owner } = await createOpenFixtureTenant(api, "pr88-range-many");
  await commitFixtureDocs(api, Array.from({ length: LIMIT + 1 }, (_, i) =>
    event(tenantId, `in${String(i).padStart(6, "0")}`, new Date(Date.UTC(2026, 0, 10, 12, 0, i % 60, i)))));

  const bounded = await runMetricsQuery(owner, tenantId, historicalUntil());
  expect(bounded).toMatchObject({ ok: true, size: LIMIT + 1, collections: { net: null, complete: false } });
});

test("borde inclusivo: 23:59:59.999 (incluido el sub-milisegundo) entra; 00:00:00.000 del día siguiente no", async () => {
  const { tenantId, owner } = await createOpenFixtureTenant(api, "pr88-range-edge");
  await commitFixtureDocs(api, [
    event(tenantId, "startEdge", new Date("2026-01-10T03:00:00.000Z"), 1),
    event(tenantId, "endEdge", new FixtureTimestamp("2026-01-11T02:59:59.999000Z"), 10),
    event(tenantId, "endEdgeMicro", new FixtureTimestamp("2026-01-11T02:59:59.999500Z"), 100),
    event(tenantId, "nextDay", new Date("2026-01-11T03:00:00.000Z"), 1000),
    event(tenantId, "beforeStart", new Date("2026-01-10T02:59:59.999Z"), 10000),
  ]);

  const bounded = await runMetricsQuery(owner, tenantId, historicalUntil());
  expect(bounded).toEqual({
    ok: true,
    size: 3,
    collections: { net: 111, confirmedCount: 3, revertedCount: 0, complete: true },
  });
});

test("la consulta acotada sigue exigiendo payments.view", async () => {
  const { tenantId } = await createOpenFixtureTenant(api, "pr88-range-authz");
  await commitFixtureDocs(api, [event(tenantId, "in1", new Date("2026-01-10T15:00:00.000Z"))]);
  const cashier = await createUser(api, { label: "pr88-range-cashier" });
  await writeFixtureDoc(api, `tenants/${tenantId}/members/${cashier.uid}`, {
    uid: cashier.uid, tenantId, role: "cashier", status: "active", createdByUid: "system:e2e",
    createdAt: new Date().toISOString(),
  });
  const other = await createOpenFixtureTenant(api, "pr88-range-other");

  expect(await runMetricsQuery(cashier, tenantId, historicalUntil())).toEqual({ ok: false, code: "permission-denied" });
  expect(await runMetricsQuery(other.owner, tenantId, historicalUntil())).toEqual({ ok: false, code: "permission-denied" });
});
