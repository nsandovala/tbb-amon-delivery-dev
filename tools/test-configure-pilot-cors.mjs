import { test } from "node:test";
import { strict as assert } from "node:assert";
import { validatePilotCors } from "./configure-pilot-cors.mjs";
import { mkdtempSync, readFileSync, unlinkSync, rmdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const project = "tbb-amon-preview";
const web = "https://tbb-amon-preview.web.app";
const admin = "https://tbb-amon-preview-admin.web.app";
test("preview accepts exactly both origins and trims whitespace", () => {
  assert.equal(validatePilotCors(project, ` ${web} , ${admin} `), `${web},${admin}`);
});
test("preview rejects missing, malformed, wildcard, external and partial origins", () => {
  for (const value of [undefined, "", "*", `${web}/,${admin}`, `${web},http://evil.example`, `${web},https://evil.example`, web, `${web},${admin}\nBAD=x`]) {
    assert.throws(() => validatePilotCors(project, value));
  }
});
test("rejects invalid project IDs", () => assert.throws(() => validatePilotCors("../bad", `${web},${admin}`)));
test("CLI writes the validated env once and preserves an existing file", () => {
  const dir = mkdtempSync(join(tmpdir(), "amon-cors-test-"));
  try {
    const run = () => spawnSync(process.execPath, ["tools/configure-pilot-cors.mjs", project, dir], {
      env: { ...process.env, AMON_CORS_ALLOWED_ORIGINS: `${web},${admin}` }, encoding: "utf8",
    });
    assert.equal(run().status, 0);
    const file = join(dir, `.env.${project}`);
    const expected = `AMON_CORS_ALLOWED_ORIGINS=${web},${admin}\n`;
    assert.equal(readFileSync(file, "utf8"), expected);
    assert.notEqual(run().status, 0);
    assert.equal(readFileSync(file, "utf8"), expected);
  } finally {
    const file = join(dir, `.env.${project}`);
    if (existsSync(file)) unlinkSync(file);
    rmdirSync(dir);
  }
});
