import { test, expect } from "@playwright/test";
import {
  applyCors,
  LOCAL_EMULATOR_ORIGINS,
  resolveCorsPolicy,
} from "../../apps/functions/src/lib/cors";

/**
 * DEPLOY-READY-01 (A2) — política CORS sin emulador.
 * El emulador siempre fija `FUNCTIONS_EMULATOR=true`, así que el modo productivo
 * (sin orígenes locales y fail-closed sin configuración) se prueba aquí con la
 * función pura. El comportamiento HTTP real está en
 * e2e/api/deploy-ready-cors.contract.spec.ts.
 */

const SITE = "https://tbb-amon-preview.web.app";
const ADMIN = "https://tbb-amon-preview-admin.web.app";

function fakeExchange(method: string, origin?: string) {
  const headers: Record<string, string> = {};
  let status: number | null = null;
  const req = { method, get: (name: string) => (name.toLowerCase() === "origin" ? origin : undefined) };
  const res = {
    setHeader: (name: string, value: string) => {
      headers[name.toLowerCase()] = value;
    },
    getHeader: (name: string) => headers[name.toLowerCase()],
    status: (code: number) => {
      status = code;
      return { end: () => undefined };
    },
  };
  return { req, res, headers, status: () => status };
}

test.describe("resolveCorsPolicy", () => {
  test("producción sin configuración: ningún origen y error explícito (fail-closed)", () => {
    const policy = resolveCorsPolicy({});
    expect(policy.origins.size).toBe(0);
    expect(policy.error).toContain("no está configurada");
  });

  test("producción con lista: solo esos orígenes, sin locales", () => {
    const policy = resolveCorsPolicy({ AMON_CORS_ALLOWED_ORIGINS: ` ${SITE} , ${ADMIN} ` });
    expect([...policy.origins].sort()).toEqual([ADMIN, SITE].sort());
    expect(policy.error).toBeUndefined();
    for (const local of LOCAL_EMULATOR_ORIGINS) expect(policy.origins.has(local)).toBe(false);
  });

  test("producción con un solo origen: no se convierte en comodín", () => {
    const policy = resolveCorsPolicy({ AMON_CORS_ALLOWED_ORIGINS: SITE });
    expect([...policy.origins]).toEqual([SITE]);
    const ex = fakeExchange("GET", "https://evil.example");
    applyCors(ex.req, ex.res, policy);
    expect(ex.headers["access-control-allow-origin"]).toBeUndefined();
  });

  for (const bad of ["http://tbb.example", `${SITE}/`, `${SITE}/tienda`, "*", "tbb.web.app", `${SITE}?x=1`]) {
    test(`producción: valor inválido "${bad}" descarta toda la lista`, () => {
      const policy = resolveCorsPolicy({ AMON_CORS_ALLOWED_ORIGINS: `${SITE},${bad}` });
      expect(policy.origins.size).toBe(0);
      expect(policy.error).toContain("inválidos");
    });
  }

  test("producción no acepta orígenes locales aunque se configuren", () => {
    for (const local of ["http://localhost:3000", "https://localhost:3000", "https://127.0.0.1"]) {
      const policy = resolveCorsPolicy({ AMON_CORS_ALLOWED_ORIGINS: local });
      expect(policy.origins.size, local).toBe(0);
      expect(policy.error, local).toContain("inválidos");
    }
  });

  test("emulador: orígenes locales de next dev y Hosting", () => {
    const policy = resolveCorsPolicy({ FUNCTIONS_EMULATOR: "true" });
    expect(policy.error).toBeUndefined();
    for (const origin of ["http://localhost:3000", "http://127.0.0.1:3001", "http://127.0.0.1:5050", "http://127.0.0.1:5055"]) {
      expect(policy.origins.has(origin)).toBe(true);
    }
    expect(policy.origins.has("http://127.0.0.1:9999")).toBe(false);
  });

  test("emulador: la lista configurada se suma a los locales", () => {
    const policy = resolveCorsPolicy({ FUNCTIONS_EMULATOR: "true", AMON_CORS_ALLOWED_ORIGINS: "http://127.0.0.1:4173" });
    expect(policy.origins.has("http://127.0.0.1:4173")).toBe(true);
    expect(policy.origins.has("http://localhost:3000")).toBe(true);
  });
});

test.describe("applyCors", () => {
  const policy = resolveCorsPolicy({ AMON_CORS_ALLOWED_ORIGINS: `${SITE},${ADMIN}` });

  test("ambos orígenes preview reciben cabeceras y preflight autorizado", () => {
    for (const origin of [SITE, ADMIN]) {
      const ex = fakeExchange("OPTIONS", origin);
      expect(applyCors(ex.req, ex.res, policy)).toBe(true);
      expect(ex.status()).toBe(204);
      expect(ex.headers["access-control-allow-origin"]).toBe(origin);
      expect(ex.headers["access-control-allow-headers"]).toBe("Authorization, Content-Type");
    }
  });

  test("origen permitido: refleja el origen y agrega Vary", () => {
    const ex = fakeExchange("POST", SITE);
    expect(applyCors(ex.req, ex.res, policy)).toBe(false);
    expect(ex.headers["access-control-allow-origin"]).toBe(SITE);
    expect(ex.headers["vary"]).toBe("Origin");
  });

  test("origen ajeno o sin origen: sin cabecera, el handler sigue (CORS no es antiabuso)", () => {
    for (const origin of ["https://evil.example", undefined]) {
      const ex = fakeExchange("POST", origin);
      expect(applyCors(ex.req, ex.res, policy)).toBe(false);
      expect(ex.headers["access-control-allow-origin"]).toBeUndefined();
    }
  });

  test("preflight permitido: 204 con métodos y cabeceras; no llega al handler", () => {
    const ex = fakeExchange("OPTIONS", SITE);
    expect(applyCors(ex.req, ex.res, policy)).toBe(true);
    expect(ex.status()).toBe(204);
    expect(ex.headers["access-control-allow-origin"]).toBe(SITE);
    expect(ex.headers["access-control-allow-methods"]).toContain("POST");
    expect(ex.headers["access-control-allow-methods"]).toContain("PUT");
    expect(ex.headers["access-control-allow-headers"]).toBe("Authorization, Content-Type");
  });

  test("preflight ajeno: 204 sin cabeceras CORS; no llega al handler", () => {
    const ex = fakeExchange("OPTIONS", "https://evil.example");
    expect(applyCors(ex.req, ex.res, policy)).toBe(true);
    expect(ex.status()).toBe(204);
    expect(ex.headers["access-control-allow-origin"]).toBeUndefined();
    expect(ex.headers["access-control-allow-methods"]).toBeUndefined();
  });

  test("Vary existente se conserva", () => {
    const ex = fakeExchange("GET", SITE);
    ex.res.setHeader("Vary", "Accept-Encoding");
    applyCors(ex.req, ex.res, policy);
    expect(ex.headers["vary"]).toBe("Accept-Encoding, Origin");
  });
});
