import path from "node:path";
import { build, type Plugin } from "esbuild";

/**
 * Empaqueta los componentes REALES (web o POS) para Chromium. Solo se
 * reemplazan los bordes: la API HTTP (fake-api), Firebase, la sesión y
 * next/image. Toda la lógica de UI y de intento es el código de producción.
 */
const ROOT = path.resolve(__dirname, "../../..");
const HARNESS = __dirname;
const stub = (name: string) => path.join(HARNESS, "stubs", name);

function aliases(app: "web" | "admin"): Plugin {
  const src = path.join(ROOT, "apps", app, "src");
  const fakeApi = path.join(HARNESS, "fake-api.ts");
  const exact: Record<string, string> = {
    "next/image": stub("next-image.tsx"),
    "firebase/auth": stub("firebase-auth.ts"),
    "firebase/firestore": stub("firebase-firestore.ts"),
    "@/components/tenant-provider": stub("tenant-provider.tsx"),
    "@/components/store-status-strip": stub("store-status-strip.tsx"),
    "@/lib/api/orders": fakeApi,
  };
  // Importaciones relativas que se sustituyen por su ruta resuelta.
  const bySuffix: [string, string][] = [
    [path.join(src, "lib", "api", "orders"), fakeApi],
    [path.join(src, "lib", "firebase", "client"), stub("firebase-client.ts")],
    [path.join(src, "lib", "auth", "handle-authz-loss"), stub("authz.ts")],
  ];
  return {
    name: "component-harness-aliases",
    setup(b) {
      b.onResolve({ filter: /.*/ }, (args) => {
        if (exact[args.path]) return { path: exact[args.path] };
        if (args.path.startsWith(".") && args.resolveDir) {
          const target = path.resolve(args.resolveDir, args.path);
          const hit = bySuffix.find(([from]) => target === from);
          if (hit) return { path: hit[1] };
        }
        if (args.path.startsWith("@/")) {
          return b.resolve("./" + args.path.slice(2), { kind: args.kind, resolveDir: src });
        }
        return undefined;
      });
    },
  };
}

export async function bundle(kind: "web" | "pos"): Promise<string> {
  const result = await build({
    entryPoints: [path.join(HARNESS, kind === "web" ? "web-entry.tsx" : "pos-entry.tsx")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "chrome120",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
    nodePaths: [path.join(ROOT, "node_modules")],
    plugins: [aliases(kind === "web" ? "web" : "admin")],
    logLevel: "silent",
  });
  return result.outputFiles[0].text;
}
