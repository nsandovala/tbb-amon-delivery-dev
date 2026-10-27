import type { Page } from "@playwright/test";
import { bundle } from "./build";

const ORIGIN = "http://harness.test";
const cache = new Map<string, Promise<string>>();

/**
 * Sirve el bundle en un origen http real (con sessionStorage y localStorage de
 * verdad, y recarga real con `page.reload()`), sin servidor ni red.
 */
export async function openHarness(page: Page, kind: "web" | "pos") {
  if (!cache.has(kind)) cache.set(kind, bundle(kind));
  const js = await cache.get(kind)!;
  await page.route(`${ORIGIN}/**`, (route) => {
    const url = route.request().url();
    if (url.endsWith("/app.js")) {
      return route.fulfill({ contentType: "text/javascript", body: js });
    }
    if (url.endsWith(`/${kind}`)) {
      return route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html lang="es"><body><div id="root"></div><script src="/app.js"></script></body></html>`,
      });
    }
    return route.fulfill({ status: 404, body: "" });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${ORIGIN}/${kind}`);
  return { errors };
}

type Call = { fn: string; args: unknown[]; settled: boolean };

/** Llamadas a la API falsa hechas hasta ahora (índice global). */
export function calls(page: Page): Promise<Call[]> {
  return page.evaluate(() =>
    ((window as unknown as { __calls?: Call[] }).__calls ?? []).map((c) => ({ fn: c.fn, args: c.args, settled: c.settled }))
  );
}

/** Espera la llamada n-ésima (desde 0) a `fn` y devuelve su índice global y argumentos. */
export async function waitForCall(page: Page, fn: string, nth = 0) {
  await page.waitForFunction(
    ([name, n]) => ((window as unknown as { __calls?: { fn: string }[] }).__calls ?? []).filter((c) => c.fn === name).length > n,
    [fn, nth] as const
  );
  const all = await calls(page);
  const matches = all.map((c, index) => ({ ...c, index })).filter((c) => c.fn === fn);
  return matches[nth];
}

export const respond = (page: Page, index: number, value: unknown) =>
  page.evaluate(([i, v]) => (window as unknown as { __respond: (i: number, v: unknown) => void }).__respond(i, v), [index, value] as const);

export const failNetwork = (page: Page, index: number) =>
  page.evaluate((i) => (window as unknown as { __fail: (i: number, k: string) => void }).__fail(i, "network"), index);

export const failHttp = (page: Page, index: number, status: number, code?: string) =>
  page.evaluate(
    ([i, s, c]) => (window as unknown as { __fail: (i: number, k: string, s: number, c?: string) => void }).__fail(i, "http", s, c),
    [index, status, code] as const
  );

/** Deja correr microtareas y renders pendientes. */
export const settle = (page: Page) => page.evaluate(() => new Promise((r) => setTimeout(r, 150)));

/** Intento guardado en sessionStorage para un alcance (o null). */
export const storedAttempt = (page: Page, scope: string) =>
  page.evaluate((s) => {
    const raw = window.sessionStorage.getItem("amon-order-attempt:" + s);
    return raw ? JSON.parse(raw) : null;
  }, scope);
