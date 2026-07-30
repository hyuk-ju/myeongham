import { expect, test } from "@playwright/test";

test.describe("Todo8 recovery and stress states", () => {
  test("mobile long and unbroken search text does not overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto("/cards?q=株式会社サンプル_unbroken_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    await expect(page.getByRole("heading", { name: "명함" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth * 2)).toBe(true);
  });

  test("offline ask and interrupted navigation retain a clear recovery action", async ({ page }) => {
    await page.route("**/api/ask", (route) => route.abort("internetdisconnected"));
    await page.goto("/ask");
    const question = page.getByRole("textbox");
    if (await question.count()) {
      await question.fill("연락처를 찾아줘");
      await page.getByRole("button", { name: "질문하기" }).click();
      await expect(page.getByRole("alert")).toBeVisible();
      await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible();
    } else {
      await expect(page.getByRole("link", { name: /설정에서/ })).toBeVisible();
    }
    await page.goto("/cards/00000000-0000-4000-8000-000000000099");
    expect(page.url()).toContain("/cards/");
  });
});
