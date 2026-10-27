import { defineConfig } from "@playwright/test";

/**
 * ORDER-IDEMPOTENCY O-05 — pruebas de componente en Chromium (sin emuladores,
 * sin red, sin Firebase). `npm run test:e2e:component`.
 * Requiere el navegador de Playwright (`npx playwright install chromium`), o
 * `PW_CHROMIUM_PATH` apuntando a un Chromium ya instalado.
 */
export default defineConfig({
  testDir: "./e2e/component",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    browserName: "chromium",
    viewport: { width: 1600, height: 1000 },
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
});
