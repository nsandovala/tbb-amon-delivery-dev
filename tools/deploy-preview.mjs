#!/usr/bin/env node
/**
 * TBB-TABLET-PREVIEW-01 — única vía para publicar o borrar la vista previa para tablet.
 *
 *   node tools/deploy-preview.mjs --app web --project <id> --channel tablet-web [--expires 7d]
 *   node tools/deploy-preview.mjs --app web --project <id> --channel tablet-web --delete
 *   node tools/deploy-preview.mjs --project <id> --list
 *   ... --dry-run                       muestra el comando de firebase-tools sin ejecutarlo
 *
 * Barreras (todas antes de invocar firebase-tools):
 * - `--project` obligatorio; nunca `minerp-sentinel`, `minierp-sentinel` ni `demo-*`
 *   (`.firebaserc` apunta por defecto a minerp-sentinel, así que no se depende de él).
 * - Solo canales temporales de Hosting: nunca `live`, nunca `firebase deploy`.
 * - `--expires` de 1h a 7d (por defecto 7d).
 * - Publicar exige `out/.amon-build-target` = `preview` y que
 *   `tools/build-preview.mjs --verify-out` pase sobre ese mismo out/.
 * - firebase-tools local, fijado en 15.34.1: `AMON_FIREBASE_TOOLS_JS` o `--firebase-tools`
 *   apuntan a su `lib/bin/firebase.js`. Nada se descarga.
 *
 * El ID del proyecto no se versiona: se pasa en cada ejecución.
 * Contrato: docs/architecture/tablet-preview-contract.md.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

const root = resolve(import.meta.dirname, "..");

const APPS = {
  web: { config: "firebase.preview-web.json", out: "apps/web/out" },
};

const FIREBASE_TOOLS_VERSION = "15.34.1";
const PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const FORBIDDEN_PROJECTS = ["minerp-sentinel", "minierp-sentinel"];
const CHANNEL = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const EXPIRES = /^([1-9][0-9]*)([hd])$/;
const MAX_EXPIRES_HOURS = 7 * 24;

function usage(message) {
  console.error(`[deploy-preview] ${message}`);
  console.error(
    "Uso: node tools/deploy-preview.mjs --app web --project <id> --channel <canal> [--expires 7d] [--delete] [--dry-run]\n" +
      "     node tools/deploy-preview.mjs --project <id> --list [--dry-run]"
  );
  process.exit(2);
}

function refuse(message) {
  console.error(`[deploy-preview] ✗ ${message}`);
  process.exit(3);
}

function main() {
  const { values } = parseArgs({
    options: {
      app: { type: "string" },
      project: { type: "string" },
      channel: { type: "string" },
      expires: { type: "string", default: "7d" },
      delete: { type: "boolean", default: false },
      list: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      "firebase-tools": { type: "string" },
      // Solo para las pruebas (tools/test-preview.mjs).
      "out-dir": { type: "string" },
    },
  });

  const project = values.project?.trim();
  if (!project) usage("Falta --project (no se usa el proyecto por defecto de .firebaserc).");
  if (!PROJECT_ID.test(project)) usage(`--project "${project}" no es un ID de proyecto Firebase válido.`);
  if (FORBIDDEN_PROJECTS.includes(project) || project.startsWith("demo-")) {
    refuse(`El proyecto "${project}" no puede recibir la vista previa.`);
  }

  let args;
  if (values.list) {
    args = ["hosting:channel:list", "--project", project, "--site", project];
  } else {
    const app = values.app;
    if (!app || !Object.hasOwn(APPS, app)) usage(`--app debe ser ${Object.keys(APPS).join("|")}.`);
    const channel = values.channel?.trim();
    if (!channel || !CHANNEL.test(channel)) usage("--channel debe ser un nombre de canal (minúsculas, números y guiones).");
    if (channel === "live") refuse("El canal live no se toca: la vista previa usa solo canales temporales.");

    if (values.delete) {
      args = ["hosting:channel:delete", channel, "--project", project, "--site", project, "--force"];
    } else {
      const match = EXPIRES.exec(values.expires);
      if (!match) usage(`--expires "${values.expires}" debe tener la forma <n>h o <n>d.`);
      const hours = Number(match[1]) * (match[2] === "d" ? 24 : 1);
      if (hours > MAX_EXPIRES_HOURS) refuse(`--expires ${values.expires} supera el máximo de 7d.`);

      const { config, out } = APPS[app];
      const outDir = values["out-dir"] ? resolve(values["out-dir"]) : join(root, out);
      const stampPath = join(outDir, ".amon-build-target");
      const stamp = existsSync(stampPath) ? readFileSync(stampPath, "utf8").trim() : "";
      if (stamp !== "preview") {
        refuse(`${out} no es un build de vista previa (falta la marca). Ejecuta: node tools/build-preview.mjs --app ${app}`);
      }
      const verify = spawnSync(process.execPath, [join(root, "tools/build-preview.mjs"), "--app", app, "--verify-out", "--out-dir", outDir], {
        cwd: root,
        stdio: "inherit",
      });
      if (verify.status !== 0) refuse(`${out} no pasó la verificación de vista previa.`);

      args = [
        "hosting:channel:deploy",
        channel,
        "--config",
        config,
        "--project",
        project,
        "--expires",
        values.expires,
        "--non-interactive",
      ];
    }
  }

  const firebaseJs = values["firebase-tools"] ?? process.env.AMON_FIREBASE_TOOLS_JS;
  if (values["dry-run"]) {
    console.log(`[deploy-preview] dry-run: node <firebase-tools ${FIREBASE_TOOLS_VERSION}> ${args.join(" ")}`);
    return;
  }
  if (!firebaseJs || !existsSync(firebaseJs)) {
    usage("Define AMON_FIREBASE_TOOLS_JS (o --firebase-tools) con la ruta a firebase-tools/lib/bin/firebase.js.");
  }
  const version = spawnSync(process.execPath, [firebaseJs, "--version"], { encoding: "utf8" });
  if (version.status !== 0 || version.stdout.trim() !== FIREBASE_TOOLS_VERSION) {
    refuse(`firebase-tools debe ser ${FIREBASE_TOOLS_VERSION}; se encontró "${version.stdout?.trim() || "?"}".`);
  }

  console.log(`[deploy-preview] node firebase-tools@${FIREBASE_TOOLS_VERSION} ${args.join(" ")}`);
  const run = spawnSync(process.execPath, [firebaseJs, ...args], { cwd: root, stdio: "inherit" });
  process.exit(run.status ?? 1);
}

main();
