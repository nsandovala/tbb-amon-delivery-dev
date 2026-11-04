import { test, expect, type APIRequestContext } from "@playwright/test";
import { createFixtureTenant } from "../support/emulator-fixtures";

/**
 * DEPLOY-READY-01 (A2) — CORS por allowlist en TODAS las Functions HTTP.
 *
 * Corre contra el emulador oficial de Functions (`FUNCTIONS_EMULATOR=true`), donde
 * la allowlist incluye los orígenes locales de `next dev` y del emulador de
 * Hosting. La política productiva (sin orígenes locales, fail-closed sin
 * configuración) se prueba en e2e/unit/deploy-ready-cors.spec.ts.
 *
 * CORS no es control antiabuso: un origen ajeno no recibe cabeceras CORS, pero
 * la solicitud igual llega al handler (lo que hace `curl`). Eso se afirma aquí.
 */

/** Las 19 Functions exportadas en apps/functions/src/index.ts. */
const ENDPOINTS = [
  "createOrder",
  "getOrder",
  "updateOrderStatus",
  "lookupOrderAttempt",
  "createPosSale",
  "createExpense",
  "confirmTransferPayment",
  "revertTransferConfirmation",
  "listPaymentEvents",
  "getStoreStatus",
  "getStoreControl",
  "setStoreOperation",
  "updateStoreHours",
  "updateStoreDateException",
  "deleteStoreDateException",
  "getCashCloseSummary",
  "closeCashSession",
  "getMyMembership",
  "listMyMemberships",
] as const;

const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:5050",
  "http://127.0.0.1:5055",
];
const FOREIGN_ORIGINS = ["https://evil.example", "http://127.0.0.1:9999", "null"];

function preflight(api: APIRequestContext, endpoint: string, origin: string) {
  return api.fetch(endpoint, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization, content-type",
    },
  });
}

test.describe("DEPLOY-READY-01 CORS allowlist (emulator)", () => {
  let api: APIRequestContext;

  test.beforeAll(async ({ playwright, baseURL }) => {
    api = await playwright.request.newContext({ baseURL });
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test("index.ts exporta exactamente los endpoints cubiertos", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("apps/functions/src/index.ts", "utf8");
    const exported = source
      .slice(source.indexOf("export {"))
      .match(/^\s+([A-Za-z]+),/gm)!
      .map((line) => line.trim().replace(",", ""));
    expect(exported.sort()).toEqual([...ENDPOINTS].sort());
  });

  for (const endpoint of ENDPOINTS) {
    test(`${endpoint}: preflight de origen permitido → 204 con cabeceras CORS`, async () => {
      for (const origin of ALLOWED_ORIGINS) {
        const res = await preflight(api, endpoint, origin);
        expect(res.status(), `${endpoint} ${origin}`).toBe(204);
        const headers = res.headers();
        expect(headers["access-control-allow-origin"]).toBe(origin);
        expect(headers["access-control-allow-methods"]).toContain("POST");
        expect(headers["access-control-allow-methods"]).toContain("PUT");
        expect(headers["access-control-allow-headers"]).toContain("Authorization");
        expect(headers["access-control-allow-headers"]).toContain("Content-Type");
        expect(headers["vary"]).toContain("Origin");
      }
    });

    test(`${endpoint}: preflight de origen ajeno → sin cabeceras CORS`, async () => {
      for (const origin of FOREIGN_ORIGINS) {
        const res = await preflight(api, endpoint, origin);
        expect(res.status(), `${endpoint} ${origin}`).toBe(204);
        const headers = res.headers();
        expect(headers["access-control-allow-origin"]).toBeUndefined();
        expect(headers["access-control-allow-methods"]).toBeUndefined();
        expect(headers["access-control-allow-headers"]).toBeUndefined();
      }
    });
  }

  test("GET público con origen permitido refleja el origen; ajeno no recibe cabecera", async () => {
    const tenantId = await createFixtureTenant(api, "cors");
    const allowed = await api.get(`getStoreStatus?tenantId=${tenantId}`, {
      headers: { Origin: "http://127.0.0.1:5050" },
    });
    expect(allowed.status(), await allowed.text()).toBe(200);
    expect(allowed.headers()["access-control-allow-origin"]).toBe("http://127.0.0.1:5050");
    expect(allowed.headers()["vary"]).toContain("Origin");

    const foreign = await api.get(`getStoreStatus?tenantId=${tenantId}`, {
      headers: { Origin: "https://evil.example" },
    });
    // CORS no bloquea en el servidor: la respuesta existe, el navegador no la entrega.
    expect(foreign.status(), await foreign.text()).toBe(200);
    expect(foreign.headers()["access-control-allow-origin"]).toBeUndefined();

    const noOrigin = await api.get(`getStoreStatus?tenantId=${tenantId}`);
    expect(noOrigin.status()).toBe(200);
    expect(noOrigin.headers()["access-control-allow-origin"]).toBeUndefined();
  });

  test("las respuestas de error también llevan CORS solo para orígenes permitidos", async () => {
    const invalid = { tenantId: "cors-x", channel: "web", idempotencyKey: "corta" };
    const allowed = await api.post("lookupOrderAttempt", {
      headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" },
      data: invalid,
    });
    expect(allowed.status()).toBe(400);
    expect(allowed.headers()["access-control-allow-origin"]).toBe("http://localhost:3000");

    const foreign = await api.post("lookupOrderAttempt", {
      headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
      data: invalid,
    });
    expect(foreign.status()).toBe(400);
    expect(foreign.headers()["access-control-allow-origin"]).toBeUndefined();

    const unauthorized = await api.get("getMyMembership?tenantId=cors-x", {
      headers: { Origin: "http://127.0.0.1:5055" },
    });
    expect(unauthorized.status()).toBe(401);
    expect(unauthorized.headers()["access-control-allow-origin"]).toBe("http://127.0.0.1:5055");
  });
});
