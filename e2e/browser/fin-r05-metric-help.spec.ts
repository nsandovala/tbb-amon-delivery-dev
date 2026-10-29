import { test, expect, type Page } from "@playwright/test";
import { openHarness } from "./harness/page";

/**
 * FIN-R05 — ayuda (ⓘ) de Métricas en Chromium: componente y CSS reales
 * (`components/metrics/metric-help.tsx`, `globals.css`). Antes, `:focus-within`
 * la mantenía visible tras Escape. Sin emuladores ni mocks.
 */

const tip = (page: Page) => page.getByRole("tooltip");
const help = (page: Page) => page.getByRole("button", { name: "Ayuda" });

test.beforeEach(async ({ page }) => {
  const { errors } = await openHarness(page, "metric-help");
  await expect(help(page)).toBeAttached();
  expect(errors).toEqual([]);
});

test("teclado: Tab muestra, Escape oculta con foco, Enter reabre, Tab sale", async ({ page }) => {
  await expect(tip(page)).toBeHidden();
  await page.getByRole("button", { name: "Antes" }).focus();
  await page.keyboard.press("Tab");
  await expect(help(page)).toBeFocused();
  await expect(tip(page)).toBeVisible();
  await expect(help(page)).toHaveAccessibleDescription("Transferencias confirmadas en el libro de pagos.");

  await page.keyboard.press("Escape");
  await expect(help(page)).toBeFocused();
  await expect(tip(page)).toBeHidden();

  await page.keyboard.press("Enter");
  await expect(tip(page)).toBeVisible();
  await expect(help(page)).toHaveAttribute("aria-expanded", "true");

  await page.keyboard.press("Escape");
  await expect(tip(page)).toBeHidden();
  await expect(help(page)).toHaveAttribute("aria-expanded", "false");

  await page.keyboard.press(" ");
  await expect(tip(page)).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Después" })).toBeFocused();
  await expect(tip(page)).toBeHidden();

  await page.keyboard.press("Shift+Tab");
  await expect(tip(page)).toBeVisible();
});

test("hover: se muestra al pasar y se oculta al salir; Escape la oculta bajo el puntero", async ({ page }) => {
  await help(page).hover();
  await expect(tip(page)).toBeVisible();
  await page.mouse.move(5, 5);
  await expect(tip(page)).toBeHidden();

  await help(page).click();
  await expect(tip(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tip(page)).toBeHidden();
  await page.mouse.move(5, 5);
  await help(page).hover();
  await expect(tip(page)).toBeVisible();
});

test.describe("toque", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("primer toque abre, segundo cierra, tocar fuera cierra", async ({ page }) => {
    await help(page).tap();
    await expect(tip(page)).toBeVisible();
    await help(page).tap();
    await expect(tip(page)).toBeHidden();
    await help(page).tap();
    await expect(tip(page)).toBeVisible();
    await page.touchscreen.tap(20, 800); // zona vacía de la página
    await expect(tip(page)).toBeHidden();
  });
});
