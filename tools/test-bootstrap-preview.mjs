import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPlan, validateOptions, applyPlan, main, selectCredential, PROJECT } from "./bootstrap-preview.mjs";
import { TBB_SETTINGS } from "../packages/shared/src/data/tbb/settings.ts";

const offline = ["--project", PROJECT, "--dry-run"];
const confirmed = [...offline, "--confirm-real-project", PROJECT];
const credentials = { type: "service_account", project_id: PROJECT };
const env = { GOOGLE_APPLICATION_CREDENTIALS: "test-only.json" };
const read = () => JSON.stringify(credentials);

test("explicit ADC is guarded, and selects applicationDefault without reading credential files", async () => {
  const adc = [...offline, "--auth", "adc"];
  assert.equal(validateOptions(adc, {}, () => { throw new Error("unexpected read"); }).online, false);
  assert.equal(validateOptions([...adc, "--confirm-real-project", PROJECT], {}).auth, "adc");
  assert.throws(() => validateOptions([...adc, "--confirm-real-project", "other-project"], {}));
  assert.throws(() => validateOptions(["--project", "minerp-sentinel", "--dry-run", "--auth", "adc"], {}));
  assert.throws(() => validateOptions(adc, { GCLOUD_PROJECT: "demo-amon-ci" }));
  assert.throws(() => validateOptions(adc, { FIRESTORE_EMULATOR_HOST: "localhost:8080" }));
  assert.throws(() => validateOptions(adc, env, () => { assert.fail("must not read credentials"); }));
  assert.throws(() => validateOptions([...offline, "--auth", "other"], {}));
  assert.equal(selectCredential({ auth: "adc" }, { applicationDefault: () => "adc", cert: () => assert.fail() }), "adc");
  assert.equal(selectCredential({ auth: "service-account", credentials }, { applicationDefault: () => assert.fail(), cert: value => value }), credentials);
  const log = console.log;
  console.log = () => {};
  try { await main(adc, {}, () => { assert.fail("offline ADC must not initialize"); }); }
  finally { console.log = log; }
});

test("preview disables indicators without changing shared settings or other fields", () => {
  const original = structuredClone(TBB_SETTINGS);
  const store = buildPlan().find(e => e.path === "tenants/tbb/settings/store").data;
  assert.deepEqual(store, { ...original, cart: { ...original.cart, showLikes: false, showRatings: false, floatingChatEnabled: false } });
  assert.deepEqual(TBB_SETTINGS, original);
  assert.deepEqual([TBB_SETTINGS.cart.showLikes, TBB_SETTINGS.cart.showRatings, TBB_SETTINGS.cart.floatingChatEnabled], [true, true, true]);
  store.cart.enableAddons = false;
  assert.deepEqual(TBB_SETTINGS, original);
});

test("exact project required; unknown flags and ambiguous modes rejected", () => {
  for (const project of [undefined, "minerp-sentinel", "demo-amon-ci", "other-project", `${PROJECT} `]) {
    assert.throws(() => validateOptions(project ? ["--project", project, "--dry-run"] : ["--dry-run"], {}));
  }
  for (const args of [["--project", PROJECT], [...offline, "--apply"], [...offline, "--reactivate"], [...offline, "--tenant", "other"]]) {
    assert.throws(() => validateOptions(args, {}));
  }
});

test("confirmation and explicit project credentials gate all real access", () => {
  assert.throws(() => validateOptions(["--project", PROJECT, "--apply"], {}));
  assert.throws(() => validateOptions([...offline, "--confirm-real-project", "minerp-sentinel"], {}));
  assert.throws(() => validateOptions(confirmed, {}));
  assert.equal(validateOptions(confirmed, env, read).online, true);
  assert.equal(validateOptions(["--project", PROJECT, "--apply", "--confirm-real-project", PROJECT], env, read).dryRun, false);
  for (const bad of [{ ...credentials, project_id: "minerp-sentinel" }, { type: "authorized_user" }, {}]) {
    assert.throws(() => validateOptions(confirmed, env, () => JSON.stringify(bad)));
  }
  assert.throws(() => validateOptions(confirmed, env, () => { throw new Error("unreadable"); }));
});

test("conflicting environment/config and emulator destinations are rejected", () => {
  for (const key of ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT", "FIREBASE_PROJECT_ID", "CLOUDSDK_CORE_PROJECT", "FIRESTORE_EMULATOR_HOST", "FIREBASE_FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"]) {
    assert.throws(() => validateOptions(offline, { [key]: "other" }));
  }
  for (const config of ['{"projectId":"minerp-sentinel"}', "{}", "{bad"]) {
    assert.throws(() => validateOptions(offline, { FIREBASE_CONFIG: config }, () => config));
  }
  assert.throws(() => validateOptions(offline, { FIREBASE_CONFIG: "config.json" }, () => '{"projectId":"demo-amon-ci"}'));
  assert.equal(validateOptions(offline, { FIREBASE_CONFIG: JSON.stringify({ projectId: PROJECT }) }).online, false);
});

test("plan exclusively contains tbb catalog/configuration; no operational fixtures or membership", () => {
  const plan = buildPlan();
  const collections = new Set(plan.map(e => e.path.split("/")[2] ?? "tenant"));
  assert.deepEqual([...collections].sort(), ["tenant", "categories", "products", "modifiers", "modifierGroups", "settings"].sort());
  for (const { path } of plan) assert.match(path, /^tenants\/tbb(?:\/(?:categories|products|modifiers|modifierGroups)\/[\w-]+|\/settings\/(?:store|storeHours))?$/);
  const tenant = plan.find(e => e.path === "tenants/tbb").data;
  assert.equal(tenant.location.address, "Pasaje Nueve 344, Tercer Sector, Playa Ancha, Valparaíso");
  assert.equal(tenant.contact.whatsapp, "+56969681939");
  const source = readFileSync(new URL("./bootstrap-preview.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from\s+["'][^"']*(?:seed|orders|bootstrap-owner)/);
  const ids = new Set(plan.filter(e => e.path.includes("/categories/")).map(e => e.data.id));
  for (const e of plan.filter(e => e.path.includes("/products/"))) assert.ok(ids.has(e.data.categoryId));
});

// Unit double only: real Firebase/emulators are explicitly outside this task.
// Deliberately has no set/update/delete methods; unexpected writes fail the test.
function memoryDb(initial = []) {
  const documents = new Map(initial);
  let writes = 0;
  let transactions = 0;
  const getAll = async (...refs) => refs.map(path => ({ exists: documents.has(path) }));
  return { documents, get writes() { return writes; }, get transactions() { return transactions; },
    doc: path => path, getAll,
    async runTransaction(fn) {
      transactions++;
      const pending = [];
      const result = await fn({ getAll, create(path, data) {
        assert.equal(documents.has(path), false, "create-only precondition");
        pending.push([path, data]);
      } });
      for (const [path, data] of pending) { documents.set(path, data); writes++; }
      return result;
    },
  };
}

test("create-only bootstrap is idempotent and preserves existing data, timestamps and revoked membership", async () => {
  const existing = buildPlan().map(e => [e.path, { edited: true, isActive: false, createdAt: "original" }]);
  existing.push(["tenants/tbb/members/revoked", { status: "revoked" }]);
  const db = memoryDb(existing);
  const before = structuredClone(db.documents);
  const report = await applyPlan(db, () => "now", false);
  assert.equal(db.writes, 0);
  assert.ok(report.every(e => e.action === "keep-existing-review"));
  assert.deepEqual(db.documents, before);
  const empty = memoryDb();
  await applyPlan(empty, () => "first", false);
  assert.equal(empty.writes, buildPlan().length);
  const first = structuredClone(empty.documents);
  await applyPlan(empty, () => "second", false);
  assert.equal(empty.writes, buildPlan().length);
  assert.deepEqual(empty.documents, first);
});

test("partial initialization creates only missing documents", async () => {
  const db = memoryDb([["tenants/tbb", { status: "paused" }]]);
  await applyPlan(db, () => "now", false);
  assert.equal(db.writes, buildPlan().length - 1);
  assert.deepEqual(db.documents.get("tenants/tbb"), { status: "paused" });
});

test("online dry-run only reads; offline dry-run never connects", async () => {
  const db = memoryDb([["tenants/tbb", { status: "paused" }]]);
  const result = await applyPlan(db, () => { throw new Error("timestamp requested"); }, true);
  assert.equal(db.writes, 0);
  assert.equal(db.transactions, 0);
  assert.equal(result[0].action, "keep-existing-review");
  const originalLog = console.log;
  console.log = () => {};
  try { await main(offline, {}, () => { throw new Error("must not connect"); }); }
  finally { console.log = originalLog; }
});

test("invalid CLI fails before connecting; transaction failures propagate", async () => {
  await assert.rejects(main(["--project", "minerp-sentinel", "--dry-run"], {}, () => { assert.fail("must not connect"); }));
  const db = memoryDb();
  db.runTransaction = async () => { throw new Error("concurrent create or permission denied"); };
  await assert.rejects(applyPlan(db, () => "now", false), /concurrent create/);
  assert.equal(db.writes, 0);
});
