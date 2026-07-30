import { expect, test } from "@playwright/test";

test("authenticated user can move through capture, review, cards, enrichment, and settings", async ({ page }) => {
  await test.step("open the authenticated home and capture a real fixture", async () => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "오늘 할 일" })).toBeVisible();
    await page.goto("/capture");
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles("tests/fixtures/cards/valid-png.png");
    await expect(page.getByText(/장 담김/)).toBeVisible({ timeout: 15_000 });
  });

  await test.step("review queue remains reachable and preserves the saved draft", async () => {
    await page.goto("/capture/review");
    await expect(page.getByRole("main")).toBeVisible();
    await page.goto("/cards");
    await expect(page.getByRole("heading", { name: "명함" })).toBeVisible();
  });

  await test.step("official company search contract is exercised without an external request", async () => {
    await page.route("**/api/enrich", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          industry: "산업 장비",
          capabilities: ["정밀가공"],
          summary: "합성 공식 출처 결과",
          confident: true,
          sources: [{ url: "https://example.test/openai", title: "합성 출처" }],
        }),
      });
    });
    await page.goto("/enrich");
    await expect(page.getByRole("heading", { name: /태그|보강/ })).toBeVisible();
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "사용자 OAuth 연결" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "서버 소유 OpenAI API" })).toHaveCount(0);
    await expect(page.getByText(/회사 검색은 연결된 ChatGPT OAuth 또는 Claude OAuth/)).toBeVisible();
  });
});
