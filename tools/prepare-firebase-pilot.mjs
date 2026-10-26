import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const functionsDir = join(root, "apps/functions");
const sourceLib = join(functionsDir, "lib");
const output = join(root, ".firebase-pilot/functions");

// Functions se despliega como paquete autónomo: ni el manifiesto ni el código
// compilado pueden depender de paquetes del workspace (no existen en Cloud Build).
const WORKSPACE_IMPORT = /(?:require\s*\(|import\s*\(|from)\s*["'](?:@amon\/|@shared\/)/;

function checkNoWorkspaceImports(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      checkNoWorkspaceImports(path);
    } else if (entry.name.endsWith(".js") && WORKSPACE_IMPORT.test(readFileSync(path, "utf8"))) {
      throw new Error(`Compiled Functions import a workspace package: ${relative(root, path)}`);
    }
  }
}

const manifest = JSON.parse(readFileSync(join(functionsDir, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(functionsDir, "package-lock.json"), "utf8"));

const workspaceDeps = Object.entries(manifest.dependencies ?? {}).filter(
  ([name, range]) => name.startsWith("@amon/") || range === "*" || range.startsWith("file:") || range.startsWith("workspace:")
);
if (workspaceDeps.length > 0) {
  throw new Error(`Functions declares workspace dependencies: ${workspaceDeps.map(([n]) => n).join(", ")}`);
}

// El lock commiteado debe corresponder al manifiesto: si alguien cambia una
// dependencia sin regenerar el lock, el empaquetado falla aquí y no en producción.
const lockedDeps = lock.packages?.[""]?.dependencies ?? {};
const drift = Object.entries(manifest.dependencies ?? {}).filter(([name, range]) => lockedDeps[name] !== range);
if (drift.length > 0 || Object.keys(lockedDeps).length !== Object.keys(manifest.dependencies ?? {}).length) {
  throw new Error(
    "apps/functions/package-lock.json does not match package.json. Run: npm install --package-lock-only --workspaces=false --prefix apps/functions"
  );
}

if (!existsSync(join(sourceLib, "index.js"))) {
  throw new Error("apps/functions/lib/index.js not found; build Functions first.");
}
checkNoWorkspaceImports(sourceLib);

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync(sourceLib, join(output, "lib"), { recursive: true });
// El paquete se despliega ya compilado (solo `lib/`, sin `src/` ni tsconfig).
// Cloud Build ejecuta `npm run build`/`gcp-build` si el manifiesto los declara,
// así que el manifiesto desplegable va sin `scripts`. Dependencias y
// devDependencies se conservan intactas para que el lock siga coincidiendo.
const { scripts: _sourceScripts, ...deployManifest } = manifest;
writeFileSync(join(output, "package.json"), `${JSON.stringify(deployManifest, null, 2)}\n`);
cpSync(join(functionsDir, "package-lock.json"), join(output, "package-lock.json"));

console.log("Prepared standalone pilot Functions source at .firebase-pilot/functions (committed lockfile)");
