import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { applyPlan, buildPlan } from "./bootstrap-preview.mjs";

// Fail closed BEFORE initializing Admin: never connect to a real Firebase project.
const PROJECT = "demo-amon-ci";
if (!["127.0.0.1:8080", "127.0.0.1:8188"].includes(process.env.FIRESTORE_EMULATOR_HOST) || process.env.FIREBASE_PROJECT_ID !== PROJECT) {
  throw new Error("Requires Firestore Emulator at 127.0.0.1:8080 or 127.0.0.1:8188 and FIREBASE_PROJECT_ID=demo-amon-ci");
}
for (const key of ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT"]) {
  if (process.env[key] && process.env[key] !== PROJECT) throw new Error(`Unexpected project in ${key}`);
}

const app = initializeApp({ projectId: PROJECT }, `bootstrap-test-${randomUUID()}`);
const db = getFirestore(app);
const plan = buildPlan();
const timestamp = () => FieldValue.serverTimestamp();
const readPlan = () => db.getAll(...plan.map(({ path }) => db.doc(path)));
after(async () => { await deleteApp(app); });

test("official emulator: initial and concurrent creates, preservation, and idempotent rerun", async () => {
  // This test requires a fresh, dedicated emulator: applyPlan uses tenants/tbb.
  const before = await readPlan();
  assert.ok(before.every((snap) => !snap.exists), "refusing to run in a nonempty emulator");
  const existingPath = plan.find(({ path }) => path.includes("/products/")).path;
  const original = { untouched: true, price: 987654, createdAt: "original", nested: { keep: "yes" } };
  await db.doc(existingPath).create(original);
  const results = await Promise.all([applyPlan(db, timestamp, false), applyPlan(db, timestamp, false)]);
  for (const { path } of plan) {
    const actions = results.map((report) => report.find((entry) => entry.path === path).action).sort();
    assert.deepEqual(actions, path === existingPath ? ["keep-existing-review", "keep-existing-review"] : ["create", "keep-existing-review"], path);
  }
  const afterFirst = await readPlan();
  assert.equal(afterFirst.length, plan.length);
  assert.ok(afterFirst.every((snap) => snap.exists));
  assert.deepEqual(afterFirst.find((snap) => snap.ref.path === existingPath).data(), original);
  const rerun = await applyPlan(db, timestamp, false);
  assert.ok(rerun.every(({ action }) => action === "keep-existing-review"));
  const afterRerun = await readPlan();
  for (let i = 0; i < afterFirst.length; i++) {
    assert.deepEqual(afterRerun[i].data(), afterFirst[i].data(), plan[i].path);
    assert.ok(afterRerun[i].updateTime.isEqual(afterFirst[i].updateTime), plan[i].path);
  }
});