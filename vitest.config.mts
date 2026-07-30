import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "tests/unit/**/*.{test,spec}.{ts,tsx}",
      "tests/fixtures/intentional-red.spec.ts",
    ],
    exclude: ["tests/ct/**", "tests/e2e/**", "node_modules/**"],
    clearMocks: true,
    restoreMocks: true,
    fileParallelism: false,
  },
});
