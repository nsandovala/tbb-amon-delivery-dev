import { test, expect, type APIRequestContext } from "@playwright/test";
import { initializeApp, deleteApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
} from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  collection,
  onSnapshot,
  query,
  orderBy,
  type FirestoreError,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import {
  FIRESTORE_DOCS,
  PROJECT_ID,
  bearer,
  createFixtureTenant,
  createMembership,
  patchFixtureDoc,
  writeFixtureDoc,
} from "../support/emulator-fixtures";

/**
 * SEC-BASE / H-03 — Evidencia de revocación con listener activo.
 *
 * Suscribe `tenants/{tenantId}/expenses` con un usuario cuyo rol es admin.
 * Mientras el listener está vivo, revoca la membresía vía Firestore REST
 * (bypass con token owner, solo emulador). Verifica que el callback de error
 * de `onSnapshot` recibe `permission-denied` — propiedad en la que confía
 * el handler cliente `tearDownAuthorizedSession`.
 *
 * Propiedad observada (importante NO exagerarla):
 * - El SDK NO desconecta listeners existentes en el momento del `patch` a
 *   la membresía. La re-evaluación de rules ocurre al siguiente evento del
 *   watcher (nueva escritura en la colección observada, nuevo listener, o
 *   token refresh del cliente).
 * - Por eso disparamos una escritura en la colección después del revoke y
 *   verificamos que el error llega. En producción esto será "en la próxima
 *   actividad" — no "al instante". El cliente debe tolerar esa ventana y
 *   tratar permission-denied como fin de sesión (lo hace
 *   `tearDownAuthorizedSession`).
 */

// Comparte el projectId con `emulator-fixtures.ts`. Si el spec local y el
// Web SDK apuntaran a namespaces distintos, el listener leería membresías
// que no existen en el namespace Firestore y recibiría `permission-denied`
// en el snapshot inicial. Mantener una sola fuente de verdad.
const AUTH_HOST = "http://127.0.0.1:9099";
const FIRESTORE_HOST = "127.0.0.1";
const FIRESTORE_PORT = 8080;
const AUTH_BASE = `${AUTH_HOST}/identitytoolkit.googleapis.com/v1`;

async function createUserWithPassword(
  request: APIRequestContext,
  label: string
): Promise<{ uid: string; email: string; password: string }> {
  const email = `${label}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@e2e.amon.test`;
  const password = "e2e-password-123";
  const res = await request.post(`${AUTH_BASE}/accounts:signUp?key=fake-api-key`, {
    data: { email, password, returnSecureToken: true },
  });
  expect(res.status(), await res.text()).toBe(200);
  const body = await res.json();
  return { uid: body.localId as string, email, password };
}

async function waitForPermissionDenied(
  unsubRef: { current: Unsubscribe | null },
  listener: (resolve: (err: FirestoreError) => void, reject: (err: Error) => void) => void
): Promise<FirestoreError> {
  return new Promise<FirestoreError>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubRef.current?.();
      reject(new Error("Timed out waiting for permission-denied snapshot error"));
    }, 15_000);
    listener(
      (err) => {
        clearTimeout(timeout);
        resolve(err);
      },
      (err) => {
        clearTimeout(timeout);
        reject(err);
      }
    );
  });
}

test.describe("SEC-BASE listener revocation evidence", () => {
  let api: APIRequestContext;
  let app: FirebaseApp;
  let auth: Auth;
  let fs: Firestore;

  test.beforeAll(async ({ playwright, baseURL }) => {
    api = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { "Content-Type": "application/json" },
    });
    app = initializeApp(
      {
        apiKey: "fake-api-key",
        projectId: PROJECT_ID,
      },
      "sec-base-listener-revocation"
    );
    auth = getAuth(app);
    connectAuthEmulator(auth, AUTH_HOST, { disableWarnings: true });
    fs = getFirestore(app);
    connectFirestoreEmulator(fs, FIRESTORE_HOST, FIRESTORE_PORT);
  });

  test.afterAll(async () => {
    await signOut(auth).catch(() => {});
    await deleteApp(app).catch(() => {});
    await api.dispose();
  });

  test("revocar membresía con listener activo dispara permission-denied", async () => {
    const tenantId = await createFixtureTenant(api, "listener-revoke");
    const user = await createUserWithPassword(api, "listener-revoke-admin");
    await createMembership(api, {
      tenantId,
      uid: user.uid,
      role: "admin",
    });

    // Semilla: un gasto para que el listener emita snapshot inicial.
    await writeFixtureDoc(api, `tenants/${tenantId}/expenses/seed-expense`, {
      id: "seed-expense",
      tenantId,
      category: "supplies",
      description: "fixture",
      amount: 1000,
      paymentMethod: "cash",
      status: "active",
      occurredAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdByUid: user.uid,
    });

    const credential = await signInWithEmailAndPassword(auth, user.email, user.password);
    expect(credential.user.uid).toBe(user.uid);

    // Defensa anti-"projectId mismatch": verifica vía REST que la membresía
    // es visible EN el namespace de este Firestore app antes de abrir el
    // listener. Falla con un mensaje accionable si fixtures y spec apuntan
    // a proyectos distintos.
    const membershipCheck = await api.get(
      `${FIRESTORE_DOCS}/tenants/${tenantId}/members/${user.uid}`,
      { headers: { Authorization: "Bearer owner" } }
    );
    expect(
      membershipCheck.status(),
      `Membership not visible at project=${PROJECT_ID}. Did fixtures and Web SDK agree on projectId? body=${await membershipCheck.text()}`
    ).toBe(200);

    const q = query(
      collection(fs, `tenants/${tenantId}/expenses`),
      orderBy("occurredAt", "desc")
    );

    const firstSnapshot = new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("initial snapshot timeout")), 10_000);
      const stop = onSnapshot(
        q,
        (snap) => {
          clearTimeout(timeout);
          stop();
          resolve(snap.size);
        },
        (err) => {
          clearTimeout(timeout);
          reject(
            new Error(
              `unexpected error on initial snapshot (project=${PROJECT_ID}, tenant=${tenantId}, uid=${user.uid}): ${err.code}`
            )
          );
        }
      );
    });
    expect(await firstSnapshot).toBeGreaterThanOrEqual(1);

    // Suscripción activa que debería recibir permission-denied tras revoke.
    const unsubRef: { current: Unsubscribe | null } = { current: null };
    const errorPromise = waitForPermissionDenied(unsubRef, (resolve) => {
      unsubRef.current = onSnapshot(
        q,
        () => {
          // Snapshot adicionales antes del revoke son esperables; ignoramos.
        },
        (err) => resolve(err)
      );
    });

    // Pequeña espera para asegurar que la suscripción está establecida en servidor.
    await new Promise((r) => setTimeout(r, 300));

    await patchFixtureDoc(api, `tenants/${tenantId}/members/${user.uid}`, {
      status: "revoked",
      revokedAt: new Date().toISOString(),
      revokedByUid: "system:e2e",
    });

    // Forzamos re-evaluación del listener escribiendo en la colección
    // observada. En producción esto ocurre naturalmente con cualquier update
    // (nueva orden, nuevo gasto). Documenta la ventana entre "revoke" y
    // "cliente ve permission-denied".
    await writeFixtureDoc(api, `tenants/${tenantId}/expenses/trigger-after-revoke`, {
      id: "trigger-after-revoke",
      tenantId,
      category: "supplies",
      description: "trigger",
      amount: 100,
      paymentMethod: "cash",
      status: "active",
      occurredAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdByUid: "system:e2e",
    });

    const err = await errorPromise;
    expect(err.code).toBe("permission-denied");
    unsubRef.current?.();
  });
});
