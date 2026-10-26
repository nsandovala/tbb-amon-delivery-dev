// Guards de empaquetado del paquete autónomo de Functions (BUILD-01).
// Cada caso trabaja sobre una copia temporal; nunca modifica archivos del repo.
// Requiere apps/functions/lib compilado (npm --workspace apps/functions run build).
import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const functionsDir = join(root, "apps/functions");

if (!existsSync(join(functionsDir, "lib/index.js"))) {
  console.error("apps/functions/lib/index.js not found; build Functions first.");
  process.exit(1);
}

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "amon-pilot-guard-"));
  cpSync(join(root, "tools/prepare-firebase-pilot.mjs"), join(dir, "tools/prepare-firebase-pilot.mjs"));
  for (const file of ["package.json", "package-lock.json"]) {
    cpSync(join(functionsDir, file), join(dir, "apps/functions", file));
  }
  cpSync(join(functionsDir, "lib"), join(dir, "apps/functions/lib"), { recursive: true });
  return dir;
}

function editJson(path, mutate) {
  const data = JSON.parse(readFileSync(path, "utf8"));
  mutate(data);
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

const cases = [
  {
    name: "paquete válido se empaqueta",
    expectFailure: false,
    mutate: () => {},
  },
  {
    name: "@amon/shared re-agregado al manifiesto",
    expectFailure: true,
    message: "workspace dependencies: @amon/shared",
    mutate: (dir) =>
      editJson(join(dir, "apps/functions/package.json"), (pkg) => {
        pkg.dependencies["@amon/shared"] = "*";
      }),
  },
  {
    name: "rango cambiado sin regenerar el lock",
    expectFailure: true,
    message: "package-lock.json does not match package.json",
    mutate: (dir) =>
      editJson(join(dir, "apps/functions/package.json"), (pkg) => {
        pkg.dependencies.zod = "^4.99.0";
      }),
  },
  {
    name: "compilado importa @amon/shared",
    expectFailure: true,
    message: "Compiled Functions import a workspace package",
    mutate: (dir) => appendFileSync(join(dir, "apps/functions/lib/index.js"), '\nrequire("@amon/shared");\n'),
  },
];

let failures = 0;
for (const testCase of cases) {
  const dir = sandbox();
  try {
    testCase.mutate(dir);
    const run = spawnSync(process.execPath, [join(dir, "tools/prepare-firebase-pilot.mjs")], { encoding: "utf8" });
    const output = `${run.stdout}${run.stderr}`;
    const failed = run.status !== 0;
    const ok = testCase.expectFailure ? failed && output.includes(testCase.message) : !failed;
    console.log(`${ok ? "PASS" : "FAIL"}  ${testCase.name}`);
    if (!ok) {
      failures += 1;
      console.log(output.trim().split("\n").slice(-3).join("\n"));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (failures > 0) {
  console.error(`${failures} guard check(s) failed`);
  process.exit(1);
}
console.log(`All ${cases.length} pilot packaging guard checks passed`);
