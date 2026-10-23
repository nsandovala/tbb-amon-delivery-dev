import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const functionsDir = join(root, "apps/functions");
const sourceLib = join(functionsDir, "lib");
const output = join(root, ".firebase-pilot/functions");

function checkNoWorkspaceImports(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      checkNoWorkspaceImports(path);
    } else if (entry.name.endsWith(".js")) {
      const js = readFileSync(path, "utf8");
      if (/(?:require|import)\s*\(\s*["'](?:@amon\/shared|@shared\/)/.test(js)) {
        throw new Error(`Compiled Functions still import a workspace package: ${relative(root, path)}`);
      }
    }
  }
}

const original = JSON.parse(readFileSync(join(functionsDir, "package.json"), "utf8"));
if (!original.dependencies?.["@amon/shared"]) {
  throw new Error("Expected @amon/shared in the source package; review pilot packaging before changing it.");
}
checkNoWorkspaceImports(sourceLib);

const dependencies = { ...original.dependencies };
delete dependencies["@amon/shared"];

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync(sourceLib, join(output, "lib"), { recursive: true });
writeFileSync(
  join(output, "package.json"),
  `${JSON.stringify({
    name: "@amon/functions-pilot",
    private: true,
    main: original.main,
    engines: original.engines,
    dependencies,
  }, null, 2)}\n`
);

console.log("Prepared standalone pilot Functions source at .firebase-pilot/functions");
