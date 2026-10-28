import { defineConfig } from "@playwright/test";

/**
 * ORDER-IDEMPOTENCY — pruebas de navegador integradas (Chromium + emuladores).
 *
 * Necesitan Auth, Firestore y Functions en los emuladores, igual que los
 * contratos API:
 *   npm --workspace apps/functions run build
 *   npx firebase-tools@15.34.1 emulators:exec --project demo-amon-ci \
 *     --only auth,firestore,functions 'npm run test:e2e:browser'
 * (`--config firebase.pilot.json` para el empaquetado piloto).
 *
 * Chromium de Playwright: `npx playwright install chromium`, o
 * `PW_CHROMIUM_PATH` con un Chromium ya instalado.
 */
const FUNCTIONS_BASE_URL =
  process.env.FUNCTIONS_BASE_URL ??
  `http://127.0.0.1:5001/${process.env.FIREBASE_PROJECT_ID ?? "minerp-sentinel"}/us-central1/`;

export default defineConfig({
  testDir: "./e2e/browser",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: FUNCTIONS_BASE_URL,
    browserName: "chromium",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
});
