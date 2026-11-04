import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test, expect, type APIRequestContext } from "@playwright/test";
import { createFixtureTenant, listFixtureDocs, PROJECT_ID } from "../support/emulator-fixtures";

/**
 * DEPLOY-READY-01 (A5) — herramientas administrativas atadas a un proyecto explícito.
 *
 * Corre dentro de `emulators:exec` (Auth + Firestore + Functions). Los casos
 * negativos abortan ANTES de inicializar Admin SDK: ninguno llega a la red.
 * El único caso que escribe lo hace en el emulador, en un tenant fixture.
 */

const BOOTSTRAP = "tools/bootstrap-owner.mjs";
const SET_ADMIN_CLAIM = "tools/set-admin-claim.mjs";

/** Entorno del emulador sin fuentes de proyecto heredadas de la terminal. */
function emulatorEnv(extra: Record<string, string | undefined> = {}) {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const name of ["GOOGLE_CLOUD_PROJECT", "FIREBASE_PROJECT_ID", "FIREBASE_CONFIG", "GOOGLE_APPLICATION_CREDENTIALS"]) {
    delete env[name];
  }
  env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
  env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
  env.GCLOUD_PROJECT = PROJECT_ID;
  return { ...env, ...extra };
}

function run(script: string, args: string[], env: Record<string, string | undefined>) {
  const defined = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined)) as NodeJS.ProcessEnv;
  const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env: defined });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

test.describe("DEPLOY-READY-01 admin tools (emulator)", () => {
  let api: APIRequestContext;
  let tenantId: string;

  test.beforeAll(async ({ playwright, baseURL }) => {
    api = await playwright.request.newContext({ baseURL });
    tenantId = await createFixtureTenant(api, "tools");
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  const owner = () => ["--tenant", tenantId, "--uid", `uid-${randomUUID()}`, "--created-by-uid", "system:bootstrap"];

  async function memberUids(): Promise<string[]> {
    const docs = await listFixtureDocs(api, `tenants/${tenantId}/members`);
    return docs.map((doc) => doc.name.split("/").pop()!);
  }

  test("bootstrap-owner sin --project aborta sin escribir", async () => {
    const before = await memberUids();
    const result = run(BOOTSTRAP, owner(), emulatorEnv());
    expect(result.status, result.output).toBe(2);
    expect(result.output).toContain("Required: --project");
    expect(await memberUids()).toEqual(before);
  });

  test("bootstrap-owner con --project distinto del emulador aborta sin escribir", async () => {
    const before = await memberUids();
    const result = run(BOOTSTRAP, ["--project", "otro-proyecto", ...owner()], emulatorEnv());
    expect(result.status, result.output).toBe(6);
    expect(result.output).toContain(`GCLOUD_PROJECT = ${PROJECT_ID}`);
    expect(await memberUids()).toEqual(before);
  });

  test("bootstrap-owner aborta si FIREBASE_PROJECT_ID del entorno apunta a otro proyecto", async () => {
    const result = run(BOOTSTRAP, ["--project", PROJECT_ID, ...owner()], emulatorEnv({ FIREBASE_PROJECT_ID: "minerp-sentinel" }));
    expect(result.status, result.output).toBe(6);
    expect(result.output).toContain("FIREBASE_PROJECT_ID = minerp-sentinel");
  });

  test("bootstrap-owner con --project inválido aborta", async () => {
    const result = run(BOOTSTRAP, ["--project", "Proyecto Malo", ...owner()], emulatorEnv());
    expect(result.status, result.output).toBe(2);
  });

  test("bootstrap-owner sin emulador y sin confirmación aborta", async () => {
    const result = run(BOOTSTRAP, ["--project", "tbb-pilot-placeholder", ...owner()], emulatorEnv({
      FIRESTORE_EMULATOR_HOST: undefined,
      GCLOUD_PROJECT: undefined,
    }));
    expect(result.status, result.output).toBe(5);
    expect(result.output).toContain("Refusing to touch a real Firestore project");
  });

  test("bootstrap-owner --dry-run sin emulador y sin confirmación aborta (también lee Firestore)", async () => {
    const result = run(BOOTSTRAP, ["--project", "tbb-pilot-placeholder", ...owner(), "--dry-run"], emulatorEnv({
      FIRESTORE_EMULATOR_HOST: undefined,
      GCLOUD_PROJECT: undefined,
    }));
    expect(result.status, result.output).toBe(5);
    expect(result.output).toContain("Refusing to touch a real Firestore project");
    expect(result.output).not.toContain("[dry-run]");
  });

  test("bootstrap-owner --dry-run en el emulador no escribe", async () => {
    const before = await memberUids();
    const result = run(BOOTSTRAP, ["--project", PROJECT_ID, ...owner(), "--dry-run"], emulatorEnv());
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain("[dry-run] would create");
    expect(await memberUids()).toEqual(before);
  });

  test("bootstrap-owner con proyecto demo-* fuera del emulador aborta", async () => {
    const result = run(
      BOOTSTRAP,
      ["--project", "demo-amon-ci", ...owner(), "--i-understand-this-is-not-emulator"],
      emulatorEnv({ FIRESTORE_EMULATOR_HOST: undefined, GCLOUD_PROJECT: undefined })
    );
    expect(result.status, result.output).toBe(6);
    expect(result.output).toContain("outside the emulator");
  });

  test("bootstrap-owner con --project del emulador crea el owner y es idempotente", async () => {
    const uid = `uid-${randomUUID()}`;
    const args = ["--project", PROJECT_ID, "--tenant", tenantId, "--uid", uid, "--created-by-uid", "system:bootstrap"];
    const created = run(BOOTSTRAP, args, emulatorEnv());
    expect(created.status, created.output).toBe(0);
    expect(created.output).toContain(`Created tenants/${tenantId}/members/${uid} as owner/active.`);
    expect(await memberUids()).toContain(uid);

    const again = run(BOOTSTRAP, args, emulatorEnv());
    expect(again.status, again.output).toBe(0);
    expect(again.output).toContain("No-op");
  });

  test("set-admin-claim sin emulador de Auth aborta", async () => {
    const result = run(
      SET_ADMIN_CLAIM,
      ["--project", PROJECT_ID, "nadie@amon.test", "password-123"],
      emulatorEnv({ FIREBASE_AUTH_EMULATOR_HOST: undefined })
    );
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("solo para el emulador de Auth");
  });

  test("set-admin-claim sin --project aborta (sin proyecto por defecto)", async () => {
    const email = `legacy-${randomUUID()}@amon.test`;
    const result = run(SET_ADMIN_CLAIM, [email, "password-123"], emulatorEnv());
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("Falta --project");
    const lookup = await api.post(
      `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`,
      { headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, data: { email: [email] } }
    );
    expect(lookup.status(), await lookup.text()).toBe(200);
    expect((await lookup.json()).users).toBeUndefined();
  });

  test("set-admin-claim con --project distinto de GCLOUD_PROJECT aborta", async () => {
    const result = run(SET_ADMIN_CLAIM, ["--project", "minerp-sentinel", "nadie@amon.test", "password-123"], emulatorEnv());
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("no coincide con GCLOUD_PROJECT");
  });

  test("set-admin-claim en el emulador crea el usuario en el proyecto indicado", async () => {
    const email = `legacy-${randomUUID()}@amon.test`;
    const result = run(SET_ADMIN_CLAIM, ["--project", PROJECT_ID, email, "password-123"], emulatorEnv());
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain("Claim admin:true");
    // El usuario quedó en el Auth emulado de PROJECT_ID (no en minerp-sentinel).
    const lookup = await api.post(
      `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`,
      { headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, data: { email: [email] } }
    );
    expect(lookup.status(), await lookup.text()).toBe(200);
    expect((await lookup.json()).users?.[0]?.email).toBe(email);
  });
});
