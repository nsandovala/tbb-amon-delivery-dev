import path from "node:path";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { build, type Plugin } from "esbuild";
import postcss from "postcss";

/**
 * Empaqueta los componentes REALES para Chromium, con el cliente HTTP real,
 * el SDK real de Firebase (Auth y Firestore apuntando a los emuladores) y el
 * CSS real (Tailwind de cada app). Solo se reemplazan piezas del framework
 * Next que no existen fuera de su servidor: `next/image`, `next/link` y
 * `next/navigation`. No hay mocks de datos, API ni Firebase.
 */
const ROOT = path.resolve(__dirname, "../../..");
const HARNESS = __dirname;
export const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? "minerp-sentinel";

function aliases(app: "web" | "admin"): Plugin {
  const src = path.join(ROOT, "apps", app, "src");
  const shims: Record<string, string> = {
    "next/image": path.join(HARNESS, "shims", "next-image.tsx"),
    "next/link": path.join(HARNESS, "shims", "next-link.tsx"),
    "next/navigation": path.join(HARNESS, "shims", "next-navigation.ts"),
  };
  return {
    name: "browser-harness-aliases",
    setup(b) {
      b.onResolve({ filter: /.*/ }, (args) => {
        if (shims[args.path]) return { path: shims[args.path] };
        if (args.path.startsWith("@/")) {
          return b.resolve("./" + args.path.slice(2), { kind: args.kind, resolveDir: src });
        }
        return undefined;
      });
      // El CSS se compila aparte con el Tailwind de cada app.
      b.onResolve({ filter: /\.css$/ }, () => ({ path: "ignored-css", namespace: "ignored" }));
      b.onLoad({ filter: /.*/, namespace: "ignored" }, () => ({ contents: "", loader: "js" }));
    },
  };
}

async function bundleJs(kind: "web" | "pos"): Promise<string> {
  const env = {
    NODE_ENV: "development",
    // Igual que `next dev` con emuladores: la API va por el proxy same-origin
    // `/api/functions/*` (en Next lo hace un rewrite; aquí, la capa de transporte).
    NEXT_PUBLIC_USE_EMULATOR: "true",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_API_KEY: "fake-api-key",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "localhost",
    NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  };
  const define = Object.fromEntries(
    Object.entries(env).map(([key, value]) => [`process.env.${key}`, JSON.stringify(value)])
  );
  const result = await build({
    entryPoints: [path.join(HARNESS, kind === "web" ? "web-entry.tsx" : "pos-entry.tsx")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "chrome120",
    jsx: "automatic",
    define,
    banner: { js: "window.process = window.process || { env: {} };" },
    nodePaths: [path.join(ROOT, "node_modules")],
    plugins: [aliases(kind === "web" ? "web" : "admin")],
    logLevel: "silent",
  });
  return result.outputFiles[0].text;
}

async function bundleCss(kind: "web" | "pos"): Promise<string> {
  if (kind === "web") {
    // apps/web usa Tailwind 3 con su propia configuración.
    // Se invoca el CLI con el mismo Node (sin `.bin`, que en Windows es un `.cmd`).
    const cwd = path.join(ROOT, "apps", "web");
    const cli = path.join(cwd, "node_modules", "tailwindcss", "lib", "cli.js");
    const out = spawnSync(process.execPath, [cli, "-c", "tailwind.config.ts", "-i", "src/app/global.css"], {
      cwd,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    if (out.status !== 0) throw new Error(`Tailwind web (${out.status}): ${out.error?.message ?? ""} ${out.stderr ?? ""}`);
    return out.stdout;
  }
  // apps/admin usa Tailwind 4 vía @tailwindcss/postcss.
  const base = path.join(ROOT, "apps", "admin");
  const from = path.join(base, "src", "app", "globals.css");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const tailwind = require("@tailwindcss/postcss");
  const result = await postcss([tailwind({ base })]).process(readFileSync(from, "utf8"), { from });
  return result.css;
}

export async function bundle(kind: "web" | "pos"): Promise<{ js: string; css: string }> {
  const [js, css] = await Promise.all([bundleJs(kind), bundleCss(kind)]);
  return { js, css };
}
