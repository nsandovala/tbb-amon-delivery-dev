import { test, expect, type Page } from "@playwright/test";
import { createMembership, createUser, FIXTURE_PASSWORD } from "../support/emulator-fixtures";

/**
 * HOSTING-SPIKE-01 — ¿sirven web y admin como sitios estáticos?
 *
 * Todo es real y sin mocks: los archivos los sirve el emulador oficial de
 * Firebase Hosting (`firebase.hosting.json`), los datos son el seed de `tbb` en
 * el emulador de Firestore, la sesión es Auth emulado y las APIs son las
 * Functions emuladas, llamadas directo (sin el proxy de `next dev`).
 * El owner se crea igual que `tools/bootstrap-owner.mjs`: usuario en Auth +
 * `tenants/tbb/members/{uid}` como `owner/active`.
 */

const WEB = process.env.HOSTING_WEB_URL ?? "http://127.0.0.1:5050";
const ADMIN = process.env.HOSTING_ADMIN_URL ?? "http://127.0.0.1:5055";
const SEED_PRODUCT = "Combo Súper Mechada Z OG";

function watch(page: Page) {
  const pageErrors: string[] = [];
  const functionCalls: { url: string; status: number }[] = [];
  const proxyCalls: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.url().includes(":5001/")) functionCalls.push({ url: response.url(), status: response.status() });
  });
  page.on("request", (request) => {
    if (request.url().includes("/api/functions")) proxyCalls.push(request.url());
  });
  return { pageErrors, functionCalls, proxyCalls };
}

test.describe("Firebase Hosting estático (emulador oficial)", () => {
  test("rutas, 404, redirección y cabeceras de caché", async ({ request }) => {
    for (const url of [`${WEB}/`, `${WEB}/tienda/tbb`, `${ADMIN}/login`, `${ADMIN}/pedidos`, `${ADMIN}/pos`, `${ADMIN}/operacion`]) {
      const res = await request.get(url, { maxRedirects: 0 });
      expect(res.status(), url).toBe(200);
      expect(res.headers()["cache-control"], url).toBe("no-cache");
    }
    expect((await request.get(`${WEB}/tienda/no-existe`)).status()).toBe(404);

    const root = await request.get(`${ADMIN}/`, { maxRedirects: 0 });
    expect(root.status()).toBe(302);
    expect(root.headers()["location"]).toMatch(/\/pedidos$/);

    const html = await (await request.get(`${WEB}/`)).text();
    const asset = html.match(/\/_next\/static\/[^"]+\.js/)?.[0];
    expect(asset).toBeTruthy();
    const assetRes = await request.get(`${WEB}${asset}`);
    expect(assetRes.status()).toBe(200);
    expect(assetRes.headers()["cache-control"]).toContain("immutable");
  });

  test("tienda /tienda/tbb: catálogo del seed desde Firestore, sin errores", async ({ page }) => {
    const seen = watch(page);
    await page.goto(`${WEB}/tienda/tbb`);
    await expect(page.getByText(SEED_PRODUCT).first()).toBeVisible({ timeout: 20_000 });
    await page.reload();
    await expect(page.getByText(SEED_PRODUCT).first()).toBeVisible({ timeout: 20_000 });
    expect(seen.pageErrors).toEqual([]);
    expect(seen.proxyCalls).toEqual([]);
  });

  test("admin: login → /pedidos, /pos y /operacion con datos, y recarga directa en cada una", async ({ page, request }) => {
    const owner = await createUser(request, { label: "hosting-owner" });
    await createMembership(request, { tenantId: "tbb", uid: owner.uid, role: "owner", createdByUid: "system:bootstrap" });
    const seen = watch(page);

    await page.goto(`${ADMIN}/login`);
    await page.locator('input[type="email"]').fill(owner.email);
    await page.locator('input[type="password"]').fill(FIXTURE_PASSWORD);
    await page.getByRole("button", { name: /Ingresar/ }).click();
    await page.waitForURL(/\/pedidos$/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Pedidos en vivo" })).toBeVisible({ timeout: 20_000 });

    const checks: [string, () => Promise<void>][] = [
      ["/pos", async () => {
        await expect(page.getByRole("heading", { name: "The Best Burger" })).toBeVisible({ timeout: 20_000 });
        await expect(page.getByText(SEED_PRODUCT).first()).toBeVisible({ timeout: 20_000 });
      }],
      ["/operacion", async () => {
        await expect(page.getByRole("heading", { name: "Operación", exact: true })).toBeVisible({ timeout: 20_000 });
      }],
      ["/pedidos", async () => {
        await expect(page.getByRole("heading", { name: "Pedidos en vivo" })).toBeVisible({ timeout: 20_000 });
      }],
    ];
    for (const [path, assertPage] of checks) {
      await page.goto(`${ADMIN}${path}`);
      await assertPage();
      await page.reload();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await assertPage();
    }

    expect(seen.pageErrors).toEqual([]);
    expect(seen.proxyCalls).toEqual([]);
    const memberships = seen.functionCalls.filter((call) => call.url.includes("/listMyMemberships"));
    expect(memberships.length).toBeGreaterThan(0);
    expect(memberships.every((call) => call.status === 200)).toBe(true);
    expect(seen.functionCalls.filter((call) => call.status >= 500)).toEqual([]);
  });
});
