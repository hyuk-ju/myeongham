import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = ["/", "/capture", "/capture/review", "/cards", "/ask", "/enrich", "/settings"] as const;

for (const width of [375, 768, 1280]) {
  test(`core routes have no accessibility violations at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("main").first()).toBeVisible();
      const audit = await new AxeBuilder({ page }).analyze();
      expect(audit.violations, `${route} at ${width}px`).toEqual([]);
      await page.screenshot({ fullPage: true, animations: "disabled" });
    }
  });
}

test("core navigation remains keyboard reachable at 200% zoom", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => { document.body.style.zoom = "2"; });
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus-visible")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
