// Guards de la vista previa para tablet (TBB-TABLET-PREVIEW-01).
// Usa directorios temporales como out/; nunca ejecuta `next build` ni firebase-tools
// (deploy-preview corre siempre con --dry-run).
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const BUILD_PREVIEW = join(root, "tools/build-preview.mjs");
const BUILD_HOSTING = join(root, "tools/build-hosting.mjs");
const DEPLOY_PREVIEW = join(root, "tools/deploy-preview.mjs");

const MARKER = "amon-preview-build";
const PROJECT = "tbb-preview-placeholder";
const CLEAN = {
  "index.html": "<html>carta</html>",
  "_next/static/chunks/page.js": `x.dataset.amonPreview="${MARKER}"`,
};
/** API key ficticia, generada en cada ejecución (el repo no versiona literales con esa forma). */
const fakeApiKey = () => `AIza${randomBytes(27).toString("base64url").slice(0, 35)}`;

const scanCases = [
  { name: "out/ de vista previa limpio", files: CLEAN, expectFailure: false },
  { name: "sin la marca de vista previa", files: { "index.html": "<html>carta</html>" }, expectFailure: true, message: `la marca "${MARKER}"` },
  { name: "SDK de Firestore", files: { ...CLEAN, "_next/static/chunks/a.js": '"https://firestore.googleapis.com"' }, expectFailure: true, message: '"googleapis.com"' },
  { name: "URL de Functions", files: { ...CLEAN, "_next/static/chunks/a.js": `"https://us-central1-${PROJECT}.cloudfunctions.net"` }, expectFailure: true, message: '"cloudfunctions.net"' },
  { name: "endpoint createOrder", files: { ...CLEAN, "_next/static/chunks/a.js": 'fetch(base+"/createOrder")' }, expectFailure: true, message: '"/createorder"' },
  { name: "endpoint createPosSale", files: { ...CLEAN, "_next/static/chunks/a.js": 'fetch(base+"/createPosSale")' }, expectFailure: true, message: '"/createpossale"' },
  { name: "endpoint closeCashSession", files: { ...CLEAN, "_next/static/chunks/a.js": 'fetch(base+"/closeCashSession")' }, expectFailure: true, message: '"/closecashsession"' },
  { name: "paquete @firebase", files: { ...CLEAN, "_next/static/chunks/a.js": '"@firebase/firestore"' }, expectFailure: true, message: '"@firebase/"' },
  { name: "API key de Firebase", files: { ...CLEAN, "_next/static/chunks/a.js": `apiKey:"${fakeApiKey()}"` }, expectFailure: true, message: "API key de Firebase" },
  { name: "host de emulador", files: { ...CLEAN, "tienda/tbb.html": "http://127.0.0.1:8080" }, expectFailure: true, message: '"127.0.0.1"' },
  { name: "proyecto minerp-sentinel", files: { ...CLEAN, "_next/static/chunks/a.js": 'projectId:"minerp-sentinel"' }, expectFailure: true, message: '"minerp-sentinel"' },
  { name: "out/ inexistente", files: null, expectFailure: true, message: "no hay artefactos" },
];

const deployCases = [
  { name: "deploy sin --project", args: ["--app", "web", "--channel", "tablet-web"], status: 2, message: "Falta --project" },
  { name: "deploy a minerp-sentinel", args: ["--app", "web", "--channel", "tablet-web", "--project", "minerp-sentinel"], status: 3, message: "no puede recibir" },
  { name: "deploy a minierp-sentinel", args: ["--app", "web", "--channel", "tablet-web", "--project", "minierp-sentinel"], status: 3, message: "no puede recibir" },
  { name: "deploy a demo-amon-ci", args: ["--app", "web", "--channel", "tablet-web", "--project", "demo-amon-ci"], status: 3, message: "no puede recibir" },
  { name: "deploy con --project inválido", args: ["--app", "web", "--channel", "tablet-web", "--project", "Proyecto Malo"], status: 2, message: "no es un ID" },
  { name: "deploy al canal live", args: ["--app", "web", "--channel", "live", "--project", PROJECT], status: 3, message: "canal live" },
  { name: "deploy de una app sin vista previa", args: ["--app", "admin", "--channel", "tablet-admin", "--project", PROJECT], status: 2, message: "--app debe ser" },
  { name: "expiración mayor a 7d", args: ["--app", "web", "--channel", "tablet-web", "--project", PROJECT, "--expires", "8d"], status: 3, message: "máximo de 7d" },
  { name: "expiración con formato inválido", args: ["--app", "web", "--channel", "tablet-web", "--project", PROJECT, "--expires", "1w"], status: 2, message: "debe tener la forma" },
  { name: "out/ sin marca de build de vista previa", args: ["--app", "web", "--channel", "tablet-web", "--project", PROJECT], out: { files: CLEAN, stamp: null }, status: 3, message: "no es un build de vista previa" },
  { name: "out/ con marca de producción", args: ["--app", "web", "--channel", "tablet-web", "--project", PROJECT], out: { files: CLEAN, stamp: "production" }, status: 3, message: "no es un build de vista previa" },
  { name: "out/ marcado pero con Functions", args: ["--app", "web", "--channel", "tablet-web", "--project", PROJECT], out: { files: { ...CLEAN, "a.js": 'fetch(base+"/createOrder")' }, stamp: "preview" }, status: 3, message: "no pasó la verificación" },
  {
    name: "deploy válido (dry-run)",
    args: ["--app", "web", "--channel", "tablet-web", "--project", PROJECT],
    out: { files: CLEAN, stamp: "preview" },
    status: 0,
    message: `hosting:channel:deploy tablet-web --config firebase.preview-web.json --project ${PROJECT} --expires 7d --non-interactive`,
  },
  {
    name: "borrado del canal (dry-run)",
    args: ["--app", "web", "--channel", "tablet-web", "--project", PROJECT, "--delete"],
    status: 0,
    message: `hosting:channel:delete tablet-web --project ${PROJECT} --site ${PROJECT} --force`,
  },
  { name: "listado de canales (dry-run)", args: ["--project", PROJECT, "--list"], status: 0, message: `hosting:channel:list --project ${PROJECT} --site ${PROJECT}` },
];

function writeFiles(dir, files) {
  for (const [name, content] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, content);
  }
}

function withOutDir(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), "amon-preview-out-"));
  try {
    const outDir = join(dir, "out");
    if (files) writeFiles(outDir, files);
    return fn(outDir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const run = (script, args) => {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8" });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
};

const failures = [];
let count = 0;
const record = (name, problem) => {
  count += 1;
  if (problem) failures.push(`${name}: ${problem}`);
  else console.log(`ok - ${name}`);
};

for (const c of scanCases) {
  withOutDir(c.files, (outDir) => {
    const result = run(BUILD_PREVIEW, ["--app", "web", "--verify-out", "--out-dir", outDir]);
    const failed = result.status !== 0;
    if (failed !== c.expectFailure) return record(c.name, `esperaba ${c.expectFailure ? "fallo" : "éxito"}, salió ${result.status}\n${result.output}`);
    if (c.message && !result.output.includes(c.message)) return record(c.name, `falta "${c.message}"\n${result.output}`);
    record(c.name, null);
  });
}

// Inverso: un build productivo nunca puede contener código de la vista previa.
withOutDir(CLEAN, (outDir) => {
  const result = run(BUILD_HOSTING, ["--app", "web", "--verify-out", "--out-dir", outDir]);
  const ok = result.status !== 0 && result.output.includes(`"${MARKER}"`);
  record("build productivo rechaza la marca de vista previa", ok ? null : `salió ${result.status}\n${result.output}`);
});

for (const c of deployCases) {
  const exec = (outDir) => {
    const args = [...c.args, "--dry-run", ...(outDir ? ["--out-dir", outDir] : [])];
    const result = run(DEPLOY_PREVIEW, args);
    if (result.status !== c.status) return record(c.name, `esperaba ${c.status}, salió ${result.status}\n${result.output}`);
    if (c.message && !result.output.includes(c.message)) return record(c.name, `falta "${c.message}"\n${result.output}`);
    if (c.status !== 0 && result.output.includes("dry-run:")) return record(c.name, "llegó a armar el comando de firebase-tools");
    record(c.name, null);
  };
  if (c.out) {
    withOutDir(c.out.files, (outDir) => {
      if (c.out.stamp) writeFileSync(join(outDir, ".amon-build-target"), `${c.out.stamp}\n`);
      exec(outDir);
    });
  } else {
    // Sin out/ de prueba: un out/ inexistente garantiza que nada real se verifica ni se publica.
    withOutDir(null, (outDir) => exec(c.args.includes("--delete") || c.args.includes("--list") ? null : outDir));
  }
}

// La config de Hosting de la vista previa solo publica archivos estáticos con las
// cabeceras de aislamiento (también comprobadas en vivo por e2e/preview en Linux).
{
  const config = JSON.parse(readFileSync(join(root, "firebase.preview-web.json"), "utf8"));
  const problems = [];
  for (const key of ["firestore", "functions", "storage", "database", "remoteconfig", "extensions"]) {
    if (Object.hasOwn(config, key)) problems.push(`no debe declarar "${key}"`);
  }
  const hosting = config.hosting;
  if (!hosting || Array.isArray(hosting)) problems.push("hosting debe ser un único sitio");
  if (hosting?.site || hosting?.target) problems.push("hosting no debe fijar site ni target (el proyecto llega por --project)");
  if (hosting?.public !== "apps/web/out") problems.push(`public debe ser apps/web/out (es ${hosting?.public})`);
  if (hosting?.rewrites) problems.push("hosting no debe tener rewrites (no hay Functions)");
  const all = (hosting?.headers ?? []).find((entry) => entry.source === "**")?.headers ?? [];
  const header = (key) => all.find((h) => h.key.toLowerCase() === key)?.value ?? "";
  if (!header("content-security-policy").includes("connect-src 'self'")) problems.push("falta CSP connect-src 'self'");
  if (header("x-robots-tag") !== "noindex, nofollow") problems.push("falta X-Robots-Tag noindex, nofollow");
  if (header("referrer-policy") !== "no-referrer") problems.push("falta Referrer-Policy no-referrer");
  record("firebase.preview-web.json solo publica Hosting con cabeceras de aislamiento", problems.length ? problems.join("; ") : null);
}

if (failures.length > 0) {
  console.error(`\n${failures.length}/${count} guards de la vista previa fallaron:\n${failures.join("\n\n")}`);
  process.exit(1);
}
console.log(`\n${count}/${count} guards de la vista previa OK`);
