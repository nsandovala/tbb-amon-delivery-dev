import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const PREVIEW_ORIGINS = ["https://tbb-amon-preview.web.app", "https://tbb-amon-preview-admin.web.app"];

export function validatePilotCors(project, raw) {
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project ?? "")) throw new Error("Invalid project ID");
  const origins = (raw ?? "").split(",").map((value) => value.trim());
  if (!origins.length || origins.some((value) => {
    try {
      const url = new URL(value);
      return url.protocol !== "https:" || url.origin !== value || ["localhost", "127.0.0.1"].includes(url.hostname);
    } catch { return true; }
  })) throw new Error("CORS origins must be nonempty exact HTTPS origins");
  if (project === "tbb-amon-preview" && (origins.length !== PREVIEW_ORIGINS.length || PREVIEW_ORIGINS.some((value) => !origins.includes(value)))) {
    throw new Error("Preview CORS origins must match the approved Web and Admin origins");
  }
  return origins.join(",");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [project, directory] = process.argv.slice(2);
  if (!directory) throw new Error("Functions source directory is required");
  const origins = validatePilotCors(project, process.env.AMON_CORS_ALLOWED_ORIGINS);
  writeFileSync(join(directory, `.env.${project}`), `AMON_CORS_ALLOWED_ORIGINS=${origins}\n`, { flag: "wx" });
  console.log("Configured pilot CORS origins for", project);
}
