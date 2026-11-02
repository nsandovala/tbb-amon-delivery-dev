import { defineConfig, devices } from "@playwright/test";

/**
 * TBB-TABLET-PREVIEW-01 — vista previa estática (`out/` de `tools/build-preview.mjs`)
 * servida por el emulador oficial de Hosting, con la config y las cabeceras reales
 * de la vista previa. Sin Auth, Firestore ni Functions: la vista previa no los usa.
 *   node tools/build-preview.mjs --app web
 *   npx firebase-tools@15.34.1 emulators:exec --config firebase.preview-web.json \
 *     --project demo-amon-ci --only hosting "npm run test:e2e:preview"
 */
const chromium = process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {};

export default defineConfig({
  testDir: "./e2e/preview",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.PREVIEW_WEB_URL ?? "http://127.0.0.1:5050",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "tablet-portrait", use: { ...devices["Galaxy Tab S4"], launchOptions: chromium } },
    { name: "tablet-landscape", use: { ...devices["Galaxy Tab S4 landscape"], launchOptions: chromium } },
  ],
});
