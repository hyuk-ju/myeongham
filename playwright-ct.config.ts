import { defineConfig, devices } from "@playwright/experimental-ct-react";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const root = process.cwd();

export default defineConfig({
  testDir: "./tests/ct",
  testMatch: "**/*.spec.tsx",
  fullyParallel: true,
  reporter: "line",
  outputDir:
    process.env.PLAYWRIGHT_CT_OUTPUT_DIR ??
    resolve(tmpdir(), `myeongham-ct-output-${process.pid}`),
  use: {
    ...devices["Desktop Chrome"],
    trace: "off",
    screenshot: "off",
    video: "off",
    ctPort: process.env.CT_PORT === undefined ? 3100 : Number(process.env.CT_PORT),
    ctTemplateDir: "tests/ct",
    ctCacheDir:
      process.env.PLAYWRIGHT_CT_CACHE_DIR ??
      resolve(tmpdir(), `myeongham-ct-cache-${process.pid}`),
    ctViteConfig: {
      resolve: {
        alias: {
          "@": resolve(root),
        },
      },
    },
  },
  projects: [{ name: "chromium" }],
});
