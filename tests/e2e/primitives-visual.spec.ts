import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

const evidenceRoot = resolve(".omo/evidence/business-card-priority-fixes");

for (const viewport of [
  { name: "375", width: 375, height: 1200 },
  { name: "768", width: 768, height: 1200 },
  { name: "1280", width: 1280, height: 1200 },
] as const) {
  test(`auth surface is usable at ${viewport.name}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { name: "명함첩" })).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus-visible")).toHaveCount(1);
    await page.screenshot({
      path: resolve(evidenceRoot, `task-7-e2e-auth-${viewport.name}.png`),
      fullPage: true,
    });
  });
}
