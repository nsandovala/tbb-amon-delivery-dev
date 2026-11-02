// Guards del build productivo de Hosting (DEPLOY-READY-01, A1).
// Cada caso usa un directorio temporal como app (archivos .env) o como out/;
// nunca modifica archivos del repo ni ejecuta `next build`.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const script = join(root, "tools/build-hosting.mjs");

/**
 * API key ficticia y aleatoria con el formato que exige el validador. Se genera
 * en cada ejecución: el repo no versiona literales con forma de credencial.
 */
function placeholderApiKey() {
  return `AIza${randomBytes(27).toString("base64url").slice(0, 35)}`;
}

// CI la usa para el build productivo con el proyecto ficticio (qa.yml).
if (process.argv.includes("--print-placeholder-key")) {
  process.stdout.write(placeholderApiKey());
  process.exit(0);
}

const PROJECT = "tbb-pilot-placeholder";
const VALID = {
  NEXT_PUBLIC_FIREBASE_API_KEY: placeholderApiKey(),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${PROJECT}.firebaseapp.com`,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT,
  NEXT_PUBLIC_FUNCTIONS_BASE_URL: `https://us-central1-${PROJECT}.cloudfunctions.net`,
  NEXT_PUBLIC_STORE_SLUGS: "tbb",
};

/** Entorno del proceso sin variables públicas ni de build heredadas de la terminal. */
function cleanEnv(extra) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.startsWith("NEXT_PUBLIC_") && key !== "NEXT_OUTPUT" && key !== "AMON_BUILD_TARGET"
    )
  );
  return { ...env, ...extra };
}

function without(name) {
  const copy = { ...VALID };
  delete copy[name];
  return copy;
}

const envCases = [
  { name: "web válido", app: "web", env: VALID, expectFailure: false },
  { name: "admin válido (sin NEXT_PUBLIC_STORE_SLUGS)", app: "admin", env: without("NEXT_PUBLIC_STORE_SLUGS"), expectFailure: false },
  { name: "NEXT_PUBLIC_USE_EMULATOR=false aceptado", app: "web", env: { ...VALID, NEXT_PUBLIC_USE_EMULATOR: "false" }, expectFailure: false },
  { name: "web sin NEXT_PUBLIC_STORE_SLUGS", app: "web", env: without("NEXT_PUBLIC_STORE_SLUGS"), expectFailure: true, message: "NEXT_PUBLIC_STORE_SLUGS es obligatoria" },
  { name: "sin NEXT_PUBLIC_FUNCTIONS_BASE_URL", app: "admin", env: without("NEXT_PUBLIC_FUNCTIONS_BASE_URL"), expectFailure: true, message: "NEXT_PUBLIC_FUNCTIONS_BASE_URL es obligatoria" },
  { name: "sin NEXT_PUBLIC_FIREBASE_API_KEY", app: "web", env: without("NEXT_PUBLIC_FIREBASE_API_KEY"), expectFailure: true, message: "NEXT_PUBLIC_FIREBASE_API_KEY es obligatoria" },
  { name: "sin NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", app: "web", env: without("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"), expectFailure: true, message: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN es obligatoria" },
  { name: "sin NEXT_PUBLIC_FIREBASE_PROJECT_ID", app: "admin", env: without("NEXT_PUBLIC_FIREBASE_PROJECT_ID"), expectFailure: true, message: "NEXT_PUBLIC_FIREBASE_PROJECT_ID es obligatoria" },
  { name: "NEXT_PUBLIC_USE_EMULATOR=true en el proceso", app: "admin", env: { ...VALID, NEXT_PUBLIC_USE_EMULATOR: "true" }, expectFailure: true, message: "NEXT_PUBLIC_USE_EMULATOR (variable del proceso)" },
  {
    name: "NEXT_PUBLIC_USE_EMULATOR=true desde .env.local de la app",
    app: "web",
    env: VALID,
    files: { ".env.local": "NEXT_PUBLIC_USE_EMULATOR=true\n" },
    expectFailure: true,
    message: ".env.local) debe estar vacía",
  },
  {
    name: "URL de Functions local desde .env.production",
    app: "admin",
    env: without("NEXT_PUBLIC_FUNCTIONS_BASE_URL"),
    files: { ".env.production": "NEXT_PUBLIC_FUNCTIONS_BASE_URL=http://127.0.0.1:5001/x/us-central1\n" },
    expectFailure: true,
    message: 'contiene "127.0.0.1"',
  },
  {
    name: "host de emulador en otra variable pública (.env)",
    app: "admin",
    env: VALID,
    files: { ".env": "NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099\n" },
    expectFailure: true,
    message: "NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST",
  },
  {
    name: "la variable del proceso tiene prioridad sobre .env.local (igual que next build)",
    app: "web",
    env: { ...VALID, NEXT_PUBLIC_USE_EMULATOR: "false" },
    files: { ".env.local": "NEXT_PUBLIC_USE_EMULATOR=true\n" },
    expectFailure: false,
  },
  {
    name: "proyecto demo-amon-ci",
    app: "web",
    env: { ...VALID, NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-amon-ci", NEXT_PUBLIC_FUNCTIONS_BASE_URL: "https://us-central1-demo-amon-ci.cloudfunctions.net", NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo-amon-ci.firebaseapp.com" },
    expectFailure: true,
    message: 'contiene "demo-"',
  },
  {
    name: "proyecto minerp-sentinel",
    app: "admin",
    env: { ...VALID, NEXT_PUBLIC_FIREBASE_PROJECT_ID: "minerp-sentinel", NEXT_PUBLIC_FUNCTIONS_BASE_URL: "https://us-central1-minerp-sentinel.cloudfunctions.net", NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "minerp-sentinel.firebaseapp.com" },
    expectFailure: true,
    message: 'contiene "minerp-sentinel"',
  },
  {
    name: "URL de Functions de otro proyecto",
    app: "web",
    env: { ...VALID, NEXT_PUBLIC_FUNCTIONS_BASE_URL: "https://us-central1-otro-proyecto.cloudfunctions.net" },
    expectFailure: true,
    message: `debe ser "https://us-central1-${PROJECT}.cloudfunctions.net"`,
  },
  {
    name: "URL de Functions sin https",
    app: "web",
    env: { ...VALID, NEXT_PUBLIC_FUNCTIONS_BASE_URL: `http://us-central1-${PROJECT}.cloudfunctions.net` },
    expectFailure: true,
    message: "NEXT_PUBLIC_FUNCTIONS_BASE_URL",
  },
  { name: "authDomain localhost", app: "admin", env: { ...VALID, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "localhost" }, expectFailure: true, message: 'contiene "localhost"' },
  { name: "authDomain con esquema", app: "admin", env: { ...VALID, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `https://${PROJECT}.firebaseapp.com` }, expectFailure: true, message: "debe ser un nombre de host" },
  { name: "API key de desarrollo", app: "web", env: { ...VALID, NEXT_PUBLIC_FIREBASE_API_KEY: "dev" }, expectFailure: true, message: "formato de API key" },
  { name: "slugs inválidos", app: "web", env: { ...VALID, NEXT_PUBLIC_STORE_SLUGS: "tbb, Otra Tienda" }, expectFailure: true, message: "lista de slugs" },
  { name: "NEXT_OUTPUT distinto de export", app: "web", env: { ...VALID, NEXT_OUTPUT: "standalone" }, expectFailure: true, message: 'NEXT_OUTPUT (variable del proceso) debe ser "export"' },
];

const outCases = [
  { name: "out/ limpio", files: { "index.html": "<html>ok</html>", "_next/static/chunks/a.js": `fetch("https://us-central1-${PROJECT}.cloudfunctions.net")` }, expectFailure: false },
  { name: "out/ con 127.0.0.1 en un chunk", files: { "_next/static/chunks/a.js": 'connect("http://127.0.0.1:9099")' }, expectFailure: true, message: '"127.0.0.1"' },
  { name: "out/ con localhost: en HTML", files: { "login.html": "http://localhost:3001/" }, expectFailure: true, message: '"localhost:"' },
  { name: "out/ con minerp-sentinel", files: { "_next/static/chunks/b.js": 'projectId:"minerp-sentinel"' }, expectFailure: true, message: '"minerp-sentinel"' },
  { name: "out/ con demo-amon-ci", files: { "tienda/tbb.html": "demo-amon-ci" }, expectFailure: true, message: '"demo-amon-ci"' },
  { name: "out/ inexistente", files: null, expectFailure: true, message: "no hay artefactos" },
];

function writeFiles(dir, files) {
  for (const [name, content] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, content);
  }
}

function check(name, result, expectFailure, message) {
  const output = `${result.stdout}${result.stderr}`;
  const failed = result.status !== 0;
  if (failed !== expectFailure) return `${name}: esperaba ${expectFailure ? "fallo" : "éxito"}, salió ${result.status}\n${output}`;
  if (message && !output.includes(message)) return `${name}: falta el mensaje "${message}"\n${output}`;
  return null;
}

const failures = [];
let count = 0;

for (const c of envCases) {
  const dir = mkdtempSync(join(tmpdir(), "amon-hosting-env-"));
  try {
    writeFiles(dir, c.files ?? {});
    const result = spawnSync(process.execPath, [script, "--app", c.app, "--check-only", "--app-dir", dir], {
      cwd: root,
      encoding: "utf8",
      env: cleanEnv(c.env),
    });
    const problem = check(c.name, result, c.expectFailure, c.message);
    if (problem) failures.push(problem);
    else console.log(`ok - ${c.name}`);
    count += 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

for (const c of outCases) {
  const dir = mkdtempSync(join(tmpdir(), "amon-hosting-out-"));
  try {
    const outDir = join(dir, "out");
    if (c.files) writeFiles(outDir, c.files);
    const result = spawnSync(process.execPath, [script, "--app", "web", "--verify-out", "--out-dir", outDir], {
      cwd: root,
      encoding: "utf8",
      env: cleanEnv({}),
    });
    const problem = check(c.name, result, c.expectFailure, c.message);
    if (problem) failures.push(problem);
    else console.log(`ok - ${c.name}`);
    count += 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length}/${count} guards fallaron:\n${failures.join("\n\n")}`);
  process.exit(1);
}
console.log(`\n${count}/${count} guards del build de Hosting OK`);
