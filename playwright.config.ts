import { defineConfig } from "@playwright/test";

const FUNCTIONS_BASE_URL =
  process.env.FUNCTIONS_BASE_URL ??
  "http://127.0.0.1:5001/minerp-sentinel/us-central1/";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: FUNCTIONS_BASE_URL,
    extraHTTPHeaders: { "Content-Type": "application/json" },
    trace: "on-first-retry",
  },
});