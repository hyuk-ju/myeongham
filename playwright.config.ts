import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const runRoot = process.env.E2E_RUN_ROOT;
const baseURL = process.env.PLAYWRIGHT_BASE_URL;

if (runRoot === undefined || baseURL === undefined) {
  throw new Error("credential_gate: production E2E must run through scripts/run-local-production-e2e.mjs");
}

const storageState = resolve(runRoot, "storage-state.json");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  outputDir: resolve(runRoot, "playwright-output"),
  use: {
    baseURL,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      teardown: "teardown",
    },
    {
      name: "chromium",
      testIgnore: [/auth\.setup\.ts/, /auth\.teardown\.ts/],
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState,
      },
    },
    {
      name: "teardown",
      testMatch: /auth\.teardown\.ts/,
    },
  ],
});
