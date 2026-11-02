#!/usr/bin/env node
/**
 * DEPLOY-READY-01 (A1) — build productivo de Hosting, fail-closed.
 *
 *   node tools/build-hosting.mjs --app web|admin              valida, construye y revisa out/
 *   node tools/build-hosting.mjs --app web --check-only       solo valida el entorno
 *   node tools/build-hosting.mjs --app web --verify-out       solo revisa out/
 *
 * 1. Carga el entorno EFECTIVO con `@next/env` (`loadEnvConfig(dir, false)`), la
 *    misma función y el mismo orden que usa `next build`: variables del proceso,
 *    luego `.env.production.local`, `.env.local`, `.env.production` y `.env` de
 *    la app. Así un `.env.local` con valores de emulador no se cuela en el export.
 * 2. Valida las variables públicas (ver `validateHostingEnv`). Cualquier error
 *    aborta antes de compilar.
 * 3. Ejecuta `next build` con `NEXT_OUTPUT=export` y `AMON_BUILD_TARGET=production`
 *    (este último elimina del bundle las ramas de emulador y los valores locales).
 * 4. Segunda barrera: recorre `out/` y falla si encuentra marcadores locales
 *    (`127.0.0.1`, `localhost:`, proyectos de desarrollo o de CI).
 *
 * El job `hosting-spike` de CI construye contra emuladores a propósito con
 * `npm --workspace apps/<app> run build` y no pasa por aquí.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

const root = resolve(import.meta.dirname, "..");

const APPS = {
  web: { extra: ["NEXT_PUBLIC_STORE_SLUGS"] },
  admin: { extra: [] },
};

const BASE_REQUIRED = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FUNCTIONS_BASE_URL",
];

/** Valores que nunca deben llegar a un build productivo (comparación sin mayúsculas). */
const FORBIDDEN_VALUE_MARKERS = ["localhost", "127.0.0.1", "0.0.0.0", "demo-", "minerp-sentinel", "minierp-sentinel"];

/** Marcadores prohibidos en los artefactos de `out/`. */
const FORBIDDEN_ARTIFACT_MARKERS = ["127.0.0.1", "localhost:", "minerp-sentinel", "minierp-sentinel", "demo-amon-ci"];
const TEXT_ARTIFACT = /\.(html|js|mjs|css|json|txt|map|xml|webmanifest)$/i;

const PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const API_KEY = /^AIza[0-9A-Za-z_-]{35}$/;
const HOSTNAME = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Región fija de las Functions (ver apps/functions/src/lib/global-options.ts). */
const FUNCTIONS_REGION = "us-central1";

/**
 * Valida el entorno efectivo de un build productivo. Devuelve la lista de
 * errores (vacía si todo está bien). `sourceOf(name)` indica de dónde salió
 * cada valor para que el mensaje apunte al archivo culpable.
 */
function validateHostingEnv(env, app, sourceOf = () => "entorno") {
  const errors = [];
  const value = (name) => (env[name] ?? "").trim();
  const where = (name) => `${name} (${sourceOf(name)})`;

  for (const name of [...BASE_REQUIRED, ...APPS[app].extra]) {
    if (!value(name)) errors.push(`${name} es obligatoria y no está definida.`);
  }

  const useEmulator = value("NEXT_PUBLIC_USE_EMULATOR");
  if (useEmulator && useEmulator !== "false") {
    errors.push(`${where("NEXT_PUBLIC_USE_EMULATOR")} debe estar vacía o ser "false"; vale "${useEmulator}".`);
  }

  for (const [name, raw] of Object.entries(env)) {
    if (!name.startsWith("NEXT_PUBLIC_") || !raw) continue;
    const lower = raw.toLowerCase();
    const marker = FORBIDDEN_VALUE_MARKERS.find((m) => lower.includes(m));
    if (marker) errors.push(`${where(name)} contiene "${marker}", que no puede llegar a producción.`);
  }

  const projectId = value("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  if (projectId && !PROJECT_ID.test(projectId)) {
    errors.push(`${where("NEXT_PUBLIC_FIREBASE_PROJECT_ID")} no es un ID de proyecto Firebase válido.`);
  }

  const apiKey = value("NEXT_PUBLIC_FIREBASE_API_KEY");
  if (apiKey && !API_KEY.test(apiKey)) {
    errors.push(`${where("NEXT_PUBLIC_FIREBASE_API_KEY")} no tiene formato de API key web de Firebase.`);
  }

  const authDomain = value("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN");
  if (authDomain && !HOSTNAME.test(authDomain)) {
    errors.push(`${where("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN")} debe ser un nombre de host (sin esquema, puerto ni ruta).`);
  }

  const functionsBase = value("NEXT_PUBLIC_FUNCTIONS_BASE_URL");
  if (functionsBase && projectId) {
    const expected = `https://${FUNCTIONS_REGION}-${projectId}.cloudfunctions.net`;
    if (functionsBase !== expected) {
      errors.push(`${where("NEXT_PUBLIC_FUNCTIONS_BASE_URL")} debe ser "${expected}" para el proyecto "${projectId}".`);
    }
  }

  if (app === "web") {
    const slugs = value("NEXT_PUBLIC_STORE_SLUGS");
    if (slugs) {
      const list = slugs.split(",").map((s) => s.trim());
      if (list.some((s) => !SLUG.test(s))) {
        errors.push(`${where("NEXT_PUBLIC_STORE_SLUGS")} debe ser una lista de slugs separados por coma.`);
      }
    }
  }

  const output = value("NEXT_OUTPUT");
  if (output && output !== "export") {
    errors.push(`${where("NEXT_OUTPUT")} debe ser "export" en un build de Hosting.`);
  }

  return errors;
}

/** Recorre `outDir` y devuelve los hallazgos `{ file, marker }`. */
function scanArtifacts(outDir) {
  const findings = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (TEXT_ARTIFACT.test(entry.name)) {
        const text = readFileSync(path, "utf8").toLowerCase();
        for (const marker of FORBIDDEN_ARTIFACT_MARKERS) {
          if (text.includes(marker)) findings.push({ file: relative(outDir, path), marker });
        }
      }
    }
  };
  walk(outDir);
  return findings;
}

/**
 * Carga el entorno que verá `next build` en `appDir`. `@next/env` no pisa las
 * variables ya presentes en el proceso, igual que en el build real.
 */
function loadEffectiveEnv(appDir, nextAppDir) {
  const requireFromApp = createRequire(join(nextAppDir, "package.json"));
  const { loadEnvConfig } = requireFromApp("@next/env");
  const processKeys = new Set(Object.keys(process.env));
  const quiet = { info() {}, error(...args) { console.error(...args); } };
  const { combinedEnv, loadedEnvFiles } = loadEnvConfig(appDir, false, quiet, true);
  const sourceOf = (name) => {
    if (processKeys.has(name)) return "variable del proceso";
    const file = loadedEnvFiles.find((f) => f.env && Object.hasOwn(f.env, name));
    return file ? relative(root, join(appDir, file.path)) : "desconocido";
  };
  return { env: combinedEnv, sourceOf, files: loadedEnvFiles.map((f) => f.path) };
}

function fail(lines) {
  for (const line of lines) console.error(`  ✗ ${line}`);
  process.exit(1);
}

function main() {
  const { values } = parseArgs({
    options: {
      app: { type: "string" },
      "check-only": { type: "boolean", default: false },
      "verify-out": { type: "boolean", default: false },
      // Solo para las pruebas del validador (tools/test-build-hosting.mjs).
      "app-dir": { type: "string" },
      "out-dir": { type: "string" },
    },
  });

  const app = values.app;
  if (!app || !Object.hasOwn(APPS, app)) {
    console.error("Uso: node tools/build-hosting.mjs --app web|admin [--check-only | --verify-out]");
    process.exit(2);
  }

  const nextAppDir = join(root, "apps", app);
  const appDir = values["app-dir"] ? resolve(values["app-dir"]) : nextAppDir;
  const outDir = values["out-dir"] ? resolve(values["out-dir"]) : join(appDir, "out");

  const verifyOut = () => {
    if (!existsSync(outDir) || !statSync(outDir).isDirectory()) {
      fail([`No existe ${relative(root, outDir) || outDir}: no hay artefactos que verificar.`]);
    }
    const findings = scanArtifacts(outDir);
    if (findings.length > 0) {
      console.error(`[build-hosting] ${app}: out/ contiene valores locales o de desarrollo:`);
      fail(findings.map(({ file, marker }) => `${file}: "${marker}"`));
    }
    console.log(`[build-hosting] ${app}: out/ sin marcadores locales.`);
  };

  if (values["verify-out"]) {
    verifyOut();
    return;
  }

  const { env, sourceOf, files } = loadEffectiveEnv(appDir, nextAppDir);
  const errors = validateHostingEnv({ ...env, NEXT_OUTPUT: env.NEXT_OUTPUT ?? "export" }, app, sourceOf);
  if (errors.length > 0) {
    console.error(`[build-hosting] ${app}: entorno productivo inválido (archivos cargados: ${files.join(", ") || "ninguno"}).`);
    fail(errors);
  }
  console.log(`[build-hosting] ${app}: entorno productivo válido (archivos cargados: ${files.join(", ") || "ninguno"}).`);

  if (values["check-only"]) return;

  // `next` se invoca con el mismo Node y la ruta a su JS (sin `.bin/*`).
  const nextBin = createRequire(join(nextAppDir, "package.json")).resolve("next/dist/bin/next");
  const build = spawnSync(process.execPath, [nextBin, "build"], {
    cwd: nextAppDir,
    stdio: "inherit",
    env: { ...process.env, NEXT_OUTPUT: "export", AMON_BUILD_TARGET: "production" },
  });
  if (build.status !== 0) {
    console.error(`[build-hosting] ${app}: next build falló (código ${build.status ?? build.signal}).`);
    process.exit(build.status || 1);
  }

  verifyOut();
}

main();
