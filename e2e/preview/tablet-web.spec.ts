import { test, expect, type Page } from "@playwright/test";

/**
 * TBB-TABLET-PREVIEW-01 — storefront de la vista previa en tablet.
 *
 * Corre contra el `out/` real servido por el emulador de Hosting (sin respuestas
 * inventadas). Cada prueba registra todas las solicitudes del navegador y exige
 * que ninguna salga del mismo origen: sin Firebase, sin Functions.
 */

function trackForeignRequests(page: Page, origin: string): string[] {
  const foreign: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return;
    if (new URL(url).origin !== origin) foreign.push(`${request.method()} ${url}`);
  });
  return foreign;
}

test.describe("vista previa tablet: storefront", () => {
  let origin: string;
  let foreign: string[];
  let pageErrors: string[];

  test.beforeEach(async ({ page, baseURL }) => {
    origin = new URL(baseURL!).origin;
    foreign = trackForeignRequests(page, origin);
    pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
  });

  test.afterEach(() => {
    expect(foreign, "solicitudes fuera del mismo origen").toEqual([]);
    expect(pageErrors, "errores de página").toEqual([]);
  });

  test("la portada lleva a la carta demo con el aviso de vista previa", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Explorar tienda piloto/ }).first().click();
    await expect(page).toHaveURL(/\/tienda\/tbb$/);
    const notice = page.getByRole("status").filter({ hasText: "Vista previa" });
    await expect(notice).toContainText("Los pedidos y pagos están deshabilitados");
    // Visible y fijo en pantalla (no solo presente en el DOM).
    const pill = notice.getByText(/Vista previa/);
    await expect(pill).toBeInViewport();
    expect(await notice.evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
    const box = (await pill.boundingBox())!;
    // Nada lo tapa: el punto central es del aviso.
    const onTop = await pill.evaluate((el, [x, y]) => el.contains(document.elementFromPoint(x, y)), [
      box.x + box.width / 2,
      box.y + box.height / 2,
    ]);
    expect(onTop, "el aviso de vista previa queda tapado").toBe(true);
    await expect(page.getByText("Imperial Burger").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Agregar" }).first()).toBeVisible();
  });

  test("Hosting entrega las cabeceras de aislamiento de la vista previa", async ({ page }) => {
    // En Windows, superstatic (emulador de Hosting 15.34.1) normaliza el glob `**`
    // con `path.sep` (`\**`) y no aplica ninguna cabecera configurada. La prueba
    // corre en Linux (CI, workflow tablet-preview) y se repite contra el canal
    // publicado; `tools/test-preview.mjs` valida la config en cualquier sistema.
    test.skip(process.platform === "win32", "El emulador de Hosting no aplica `headers` en Windows.");
    const response = await page.goto("/tienda/tbb");
    expect(response?.status()).toBe(200);
    const headers = response!.headers();
    expect(headers["content-security-policy"]).toContain("connect-src 'self'");
    expect(headers["x-robots-tag"]).toBe("noindex, nofollow");
    expect(headers["referrer-policy"]).toBe("no-referrer");
  });

  test("confirmar un pedido falla sin enviar nada fuera del sitio", async ({ page }) => {
    await page.goto("/tienda/tbb");
    await page.getByRole("button", { name: "Agregar" }).first().click();
    await page.getByRole("button", { name: "Abrir carrito" }).click();
    await page.getByRole("button", { name: /Continuar/ }).click();

    await page.getByPlaceholder("Tu nombre completo").fill("Cliente Demo");
    await page.getByPlaceholder("WhatsApp (+569 1234 5678)").fill("+56912345678");
    await page.getByRole("button", { name: /Retiro/ }).click();
    await page.getByRole("button", { name: "Efectivo" }).click();
    await page.getByRole("button", { name: /Confirmar pedido/ }).click();

    await expect(page.getByText("No pudimos crear tu pedido.")).toBeVisible();
    await expect(page.getByText("Vista previa: enviar pedidos está deshabilitado.")).toBeVisible();
    // El rechazo es definitivo: no queda un intento de compra pendiente en el navegador.
    const pending = await page.evaluate(() =>
      Object.keys(window.sessionStorage).filter((key) => key.startsWith("amon-order-attempt:"))
    );
    expect(pending).toEqual([]);
  });
});
