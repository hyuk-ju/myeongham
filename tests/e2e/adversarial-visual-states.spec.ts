import { expect, test } from "@playwright/test";

for (const width of [375, 768, 1280]) {
  test(`error and long-text states do not overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/ask");
    await page.getByRole("textbox").fill("초장문 질문 ".repeat(100));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.goto("/capture");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ fullPage: true, animations: "disabled" });
  });
}
