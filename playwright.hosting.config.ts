import { defineConfig } from "@playwright/test";

/**
 * HOSTING-SPIKE-01 — sitios estáticos de web y admin servidos por el emulador
 * oficial de Firebase Hosting, contra Auth, Firestore y Functions emulados.
 * Requiere el build estático (`NEXT_OUTPUT=export`) y:
 *   npx firebase-tools@15.34.1 emulators:exec --config firebase.hosting.json \
 *     --project demo-amon-ci --only auth,firestore,functions,hosting \
 *     "npm run seed && npm run test:e2e:hosting"
 */
export default defineConfig({
  testDir: "./e2e/hosting",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    browserName: "chromium",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
});
