#!/usr/bin/env node
/**
 * TBB-TABLET-PREVIEW-01 — build estático de la vista previa para tablet, fail-closed.
 *
 *   node tools/build-preview.mjs --app web              construye y revisa out/
 *   node tools/build-preview.mjs --app web --verify-out solo revisa out/
 *
 * 1. Ejecuta `next build` con `NEXT_OUTPUT=export` y `AMON_BUILD_TARGET=preview`.
 *    `next.config.ts` sustituye entonces los módulos de Firebase y Functions por
 *    los de `src/preview/` (carta del seed, pedidos deshabilitados).
 * 2. Revisa `out/`: falla si encuentra el SDK de Firebase, URLs de Functions o de
 *    Google, rutas de endpoints, API keys, hosts locales o proyectos de desarrollo,
 *    y exige la marca de vista previa.
 * 3. Deja `out/.amon-build-target` = `preview`; `tools/deploy-preview.mjs` solo
 *    publica un out/ con esa marca. Hosting ignora los archivos que empiezan con punto.
 *
 * Contrato: docs/architecture/tablet-preview-contract.md.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

const root = resolve(import.meta.dirname, "..");

/** Apps con vista previa. Admin queda pendiente de definir su fuente de datos demo. */
const APPS = {
  web: { env: { NEXT_PUBLIC_STORE_SLUGS: "tbb" } },
};

const PREVIEW_MARKER = "amon-preview-build";
const BUILD_STAMP = ".amon-build-target";

/** Marcadores prohibidos (comparación sin mayúsculas). */
const FORBIDDEN_MARKERS = [
  // Firebase SDK y servicios de Google
  "googleapis.com",
  "firebaseio.com",
  "cloudfunctions.net",
  "firebaseapp.com",
  "@firebase/",
  // Endpoints de Functions
  "/createorder",
  "/createpossale",
  "/lookuporderattempt",
  "/getstorestatus",
  "/updateorderstatus",
  "/confirmtransferpayment",
  "/reverttransferconfirmation",
  "/closecashsession",
  "/createexpense",
  "/listmymemberships",
  // Entornos locales y proyectos que no corresponden
  "127.0.0.1",
  "localhost:",
  "minerp-sentinel",
  "minierp-sentinel",
  "demo-amon-ci",
];
/** API key web de Firebase (sensible a mayúsculas). */
const API_KEY_PATTERN = /AIza[0-9A-Za-z_-]{35}/;
const TEXT_ARTIFACT = /\.(html|js|mjs|css|json|txt|map|xml|webmanifest)$/i;

function scan(outDir) {
  const findings = [];
  let markerFound = false;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (TEXT_ARTIFACT.test(entry.name)) {
        const raw = readFileSync(path, "utf8");
        const text = raw.toLowerCase();
        const file = relative(outDir, path);
        for (const marker of FORBIDDEN_MARKERS) {
          if (text.includes(marker)) findings.push(`${file}: "${marker}"`);
        }
        if (API_KEY_PATTERN.test(raw)) findings.push(`${file}: API key de Firebase`);
        if (text.includes(PREVIEW_MARKER)) markerFound = true;
      }
    }
  };
  walk(outDir);
  if (!markerFound) findings.push(`ningún artefacto contiene la marca "${PREVIEW_MARKER}"`);
  return findings;
}

function fail(lines) {
  for (const line of lines) console.error(`  ✗ ${line}`);
  process.exit(1);
}

function main() {
  const { values } = parseArgs({
    options: {
      app: { type: "string" },
      "verify-out": { type: "boolean", default: false },
      // Solo para las pruebas (tools/test-build-hosting.mjs).
      "out-dir": { type: "string" },
    },
  });

  const app = values.app;
  if (!app || !Object.hasOwn(APPS, app)) {
    console.error(`Uso: node tools/build-preview.mjs --app ${Object.keys(APPS).join("|")} [--verify-out]`);
    process.exit(2);
  }

  const appDir = join(root, "apps", app);
  const outDir = values["out-dir"] ? resolve(values["out-dir"]) : join(appDir, "out");

  const verifyOut = () => {
    if (!existsSync(outDir) || !statSync(outDir).isDirectory()) {
      fail([`No existe ${relative(root, outDir) || outDir}: no hay artefactos que verificar.`]);
    }
    const findings = scan(outDir);
    if (findings.length > 0) {
      console.error(`[build-preview] ${app}: out/ no es una vista previa aislada:`);
      fail(findings);
    }
    console.log(`[build-preview] ${app}: out/ sin Firebase, Functions ni valores locales; marca de vista previa presente.`);
  };

  if (values["verify-out"]) {
    verifyOut();
    return;
  }

  // `next` se invoca con el mismo Node y la ruta a su JS (sin `.bin/*`).
  const nextBin = createRequire(join(appDir, "package.json")).resolve("next/dist/bin/next");
  const build = spawnSync(process.execPath, [nextBin, "build"], {
    cwd: appDir,
    stdio: "inherit",
    env: { ...process.env, ...APPS[app].env, NEXT_OUTPUT: "export", AMON_BUILD_TARGET: "preview" },
  });
  if (build.status !== 0) {
    console.error(`[build-preview] ${app}: next build falló (código ${build.status ?? build.signal}).`);
    process.exit(build.status || 1);
  }

  verifyOut();
  writeFileSync(join(outDir, BUILD_STAMP), "preview\n");
}

main();
