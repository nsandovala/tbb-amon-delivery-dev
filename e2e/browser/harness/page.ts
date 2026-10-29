import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Page } from "@playwright/test";
import { bundle, type HarnessKind } from "./build";

type Kind = HarnessKind;
const bundles = new Map<Kind, Promise<{ js: string; css: string }>>();
let origin: Promise<string> | null = null;

const html = (kind: Kind) =>
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/${kind}.css"></head><body><div id="root"></div><script src="/${kind}.js"></script></body></html>`;

/**
 * Servidor estático local (loopback, puerto libre) con el bundle real, como
 * `next dev` en localhost: así el navegador trata la página como local y puede
 * hablar con los emuladores (Local Network Access de Chromium).
 */
function serve(): Promise<string> {
  origin ??= new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      const path = new URL(req.url ?? "/", "http://x").pathname;
      const match = path.match(/^\/(web|pos|metric-help|transfer-control)(\.js|\.css)?$/);
      if (!match) {
        res.writeHead(404).end();
        return;
      }
      const kind = match[1] as Kind;
      if (!match[2]) {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html(kind));
        return;
      }
      if (!bundles.has(kind)) bundles.set(kind, bundle(kind));
      const { js, css } = await bundles.get(kind)!;
      res
        .writeHead(200, { "content-type": match[2] === ".js" ? "text/javascript" : "text/css" })
        .end(match[2] === ".js" ? js : css);
    });
    server.listen(0, "127.0.0.1", () => {
      server.unref();
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    });
  });
  return origin;
}

/**
 * Abre la app de prueba. `config` queda en `window.__harness` en cada carga
 * (también tras `page.reload()`, que es una recarga real del navegador con
 * sessionStorage, localStorage e IndexedDB reales).
 */
export async function openHarness(page: Page, kind: Kind, config: Record<string, unknown> = {}) {
  if (!bundles.has(kind)) bundles.set(kind, bundle(kind));
  await bundles.get(kind);
  const base = await serve();
  await page.addInitScript((value) => {
    (window as unknown as { __harness: unknown }).__harness = value;
  }, config);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/${kind}`);
  return { errors };
}

/** Intento guardado en sessionStorage para un alcance (o null). */
export const storedAttempt = (page: Page, scope: string) =>
  page.evaluate((s) => {
    const raw = window.sessionStorage.getItem("amon-order-attempt:" + s);
    return raw ? JSON.parse(raw) : null;
  }, scope);

/** Deja correr microtareas y renders pendientes. */
export const settle = (page: Page) => page.evaluate(() => new Promise((r) => setTimeout(r, 250)));
