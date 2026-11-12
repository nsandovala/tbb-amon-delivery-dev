import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";

const workflow = readFileSync(new URL("../.github/workflows/firebase-pilot-manual.yml", import.meta.url), "utf8");
const guard = workflow.match(/        run: \|\r?\n((?:          .*\r?\n)+)/)?.[1]
  .split(/\r?\n/).map((line) => line.slice(10)).join("\n");
assert.ok(guard, "preflight guard must exist");
const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
const valid = { GITHUB_REF: "refs/heads/main", CONFIRMATION: "DEPLOY_PILOT", DEPLOY_ENABLED: "true", APPROVED_PROJECT: "tbb-amon-preview", REQUESTED_PROJECT: "tbb-amon-preview", WIF_PROVIDER: "provider", SERVICE_ACCOUNT: "account", GITHUB_OUTPUT: "/dev/null" };
function run(overrides = {}) {
  const result = spawnSync(bash, ["-c", guard], { env: { ...process.env, ...valid, ...overrides }, encoding: "utf8" });
  assert.ifError(result.error);
  return result.status;
}
test("preflight accepts only the approved preview", () => {
  assert.equal(run(), 0);
  assert.notEqual(run({ REQUESTED_PROJECT: "another-project", APPROVED_PROJECT: "another-project" }), 0);
  assert.notEqual(run({ REQUESTED_PROJECT: "another-project" }), 0);
  assert.notEqual(run({ APPROVED_PROJECT: "another-project" }), 0);
  assert.notEqual(run({ WIF_PROVIDER: "" }), 0);
  assert.notEqual(run({ SERVICE_ACCOUNT: "" }), 0);
  assert.notEqual(run({ GITHUB_REF: "refs/heads/feature" }), 0);
  assert.notEqual(run({ DEPLOY_ENABLED: "false" }), 0);
  assert.notEqual(run({ CONFIRMATION: "" }), 0);
});
test("deployment is pinned to preview and the single canary", () => {
  const lines = workflow.split(/\r?\n/).filter((line) => /\bfirebase-tools@.*\bdeploy\b/.test(line));
  assert.deepEqual(lines, ['        run: npx --yes firebase-tools@15.34.1 deploy --config firebase.pilot.json --project tbb-amon-preview --only functions:amon-functions:getStoreStatus --non-interactive']);
  assert.ok(workflow.indexOf("node tools/configure-pilot-cors.mjs") < workflow.indexOf("Authenticate with approved pilot identity"));
});
