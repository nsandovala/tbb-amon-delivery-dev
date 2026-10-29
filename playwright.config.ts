import { defineConfig } from "@playwright/test";

const FUNCTIONS_BASE_URL =
  process.env.FUNCTIONS_BASE_URL ??
  `http://127.0.0.1:5001/${process.env.FIREBASE_PROJECT_ID ?? "minerp-sentinel"}/us-central1/`;

// FIN-H01: la carrera de confirmaciones/reversión/cierre debe ser la ÚNICA carga
// del emulador mientras corre. Compartirlo con otros archivos produjo 500
// "Transaction is invalid or closed" del emulador (reproducido también con el
// backend baseline). Se aísla en un proyecto que corre después de los demás;
// no se omite ninguna aserción ni se reintenta un 500.
const FIN_H01_RACE = "**/fin-01-concurrency.spec.ts";

export default defineConfig({
  testDir: "./e2e",
  // Las pruebas de navegador tienen su propia configuración (playwright.browser.config.ts).
  testIgnore: ["**/browser/**"],
  fullyParallel: false,
  projects: [
    { name: "contracts", testIgnore: ["**/browser/**", FIN_H01_RACE] },
    {
      name: "fin-h01-isolated",
      testMatch: FIN_H01_RACE,
      // Corre solo cuando "contracts" terminó. Ojo: un filtro de ruta no se
      // aplica a las dependencias, así que `playwright test e2e/api` correría
      // "contracts" completo (unitarias incluidas). Por eso `test:e2e:api` usa
      // dos fases: `--project=contracts` y luego
      // `--project=fin-h01-isolated --no-deps`.
      dependencies: ["contracts"],
    },
  ],
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: FUNCTIONS_BASE_URL,
    extraHTTPHeaders: { "Content-Type": "application/json" },
    trace: "on-first-retry",
  },
});
