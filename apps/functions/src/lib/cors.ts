import { onRequest, type HttpsFunction, type Request } from "firebase-functions/v2/https";
import { logger } from "./logger";

/**
 * DEPLOY-READY-01 (A2) — CORS por allowlist para TODAS las Functions HTTP.
 *
 * Reemplaza `{ cors: true }` (cualquier origen). Se usa un middleware propio con
 * `cors: false` porque el `cors` integrado de firebase-functions 4.9 convierte
 * una lista de un solo origen en un valor fijo y lo enviaría también a orígenes
 * ajenos.
 *
 * Orígenes permitidos:
 * - `AMON_CORS_ALLOWED_ORIGINS`: lista separada por comas de orígenes exactos
 *   (`https://<sitio>.web.app,https://<dominio>`). Se fija por despliegue con
 *   `apps/functions/.env.<projectId>` (ver docs/architecture/cors-contract.md);
 *   el repo no guarda IDs reales.
 * - Solo en el emulador (`FUNCTIONS_EMULATOR=true`): además los orígenes locales
 *   de `next dev` (3000, 3001) y del emulador de Hosting (5050, 5055).
 *
 * Fail-closed: en producción sin lista, o con una lista con algún valor
 * inválido, no se permite ningún origen (se registra un error).
 *
 * CORS NO es un control antiabuso: solo decide qué páginas pueden leer la
 * respuesta desde un navegador. `curl` o un servidor ignoran CORS; los límites
 * de abuso son COST-GUARD, la autorización por membresía y la idempotencia.
 */

const LOCAL_PORTS = [3000, 3001, 5050, 5055];
export const LOCAL_EMULATOR_ORIGINS: readonly string[] = LOCAL_PORTS.flatMap((port) => [
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
]);

const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const ALLOWED_HEADERS = "Authorization, Content-Type";
const PREFLIGHT_MAX_AGE_SECONDS = "3600";

export interface CorsPolicy {
  origins: ReadonlySet<string>;
  /** Motivo por el que la configuración se descartó entera (fail-closed). */
  error?: string;
}

type Env = Record<string, string | undefined>;

/** Un origen exacto: esquema + host (+ puerto), sin ruta, query ni barra final. */
function isExactOrigin(value: string, allowHttp: boolean): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && !(allowHttp && url.protocol === "http:")) return false;
    if (!allowHttp && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) return false;
    return url.origin === value;
  } catch {
    return false;
  }
}

export function resolveCorsPolicy(env: Env): CorsPolicy {
  const isEmulator = env.FUNCTIONS_EMULATOR === "true";
  const origins = new Set<string>(isEmulator ? LOCAL_EMULATOR_ORIGINS : []);
  const entries = (env.AMON_CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const invalid = entries.filter((entry) => !isExactOrigin(entry, isEmulator));
  if (invalid.length > 0) {
    return {
      origins: new Set(isEmulator ? LOCAL_EMULATOR_ORIGINS : []),
      error: `AMON_CORS_ALLOWED_ORIGINS contiene orígenes inválidos (${invalid.join(", ")}); se ignora la lista completa.`,
    };
  }
  for (const entry of entries) origins.add(entry);

  if (!isEmulator && origins.size === 0) {
    return { origins, error: "AMON_CORS_ALLOWED_ORIGINS no está configurada: ningún origen de navegador está permitido." };
  }
  return { origins };
}

let cachedPolicy: CorsPolicy | null = null;

function currentPolicy(): CorsPolicy {
  if (!cachedPolicy) {
    cachedPolicy = resolveCorsPolicy(process.env);
    if (cachedPolicy.error) logger.error("CORS fail-closed", { reason: cachedPolicy.error });
  }
  return cachedPolicy;
}

interface CorsResponse {
  setHeader(name: string, value: string): unknown;
  getHeader(name: string): unknown;
  status(code: number): { end(): unknown };
}

/**
 * Aplica la política a una solicitud. Devuelve `true` si la solicitud ya quedó
 * respondida (preflight) y el handler no debe ejecutarse.
 */
export function applyCors(
  req: { method: string; get(name: string): string | undefined },
  res: CorsResponse,
  policy: CorsPolicy
): boolean {
  const origin = req.get("origin");
  const allowed = Boolean(origin && policy.origins.has(origin));

  const vary = res.getHeader("Vary");
  res.setHeader("Vary", vary ? `${String(vary)}, Origin` : "Origin");
  if (allowed && origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  if (req.method === "OPTIONS") {
    if (allowed) {
      res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
      res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
      res.setHeader("Access-Control-Max-Age", PREFLIGHT_MAX_AGE_SECONDS);
    }
    // El preflight nunca llega al handler (sin lecturas de Firestore).
    res.status(204).end();
    return true;
  }
  return false;
}

type Handler = (request: Request, response: Parameters<Parameters<typeof onRequest>[0]>[1]) => void | Promise<void>;

/** `onRequest` con la allowlist de CORS compartida. Usar en todas las rutas HTTP. */
export function onRequestWithCors(handler: Handler): HttpsFunction {
  return onRequest({ cors: false }, async (req, res) => {
    if (applyCors(req, res, currentPolicy())) return;
    await handler(req, res);
  });
}
