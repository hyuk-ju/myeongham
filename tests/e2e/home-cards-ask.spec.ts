import { expect, test } from "@playwright/test";

test.describe("Todo8 home, cards, detail, and ask journey", () => {
  test("home exposes a routeable next action and cards workspace at mobile and desktop widths", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "명함첩" })).toBeVisible();
    await expect(page.getByRole("link", { name: /명함 보기|전체 보기/ }).first()).toBeVisible();

    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto("/cards");
    await expect(page.getByRole("heading", { name: "명함" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "명함 검색" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.reload();
    await expect(page.getByRole("heading", { name: "명함" })).toBeVisible();
    const selectedPreview = page.getByText("Selected slip");
    const emptyState = page.getByRole("heading", { name: /아직 등록된 명함이 없습니다|조건에 맞는 명함이 없습니다/ });
    await expect(selectedPreview.or(emptyState)).toBeVisible();
  });

  test("detail normal and not-found fallback stay routeable; ask exposes an actionable error", async ({ page }) => {
    await page.goto("/cards");
    const firstDetail = page.locator('a[href^="/cards/"]').filter({ hasText: /상세|보기/ }).first();
    if (await firstDetail.count()) {
      await firstDetail.click();
      await expect(page.getByRole("link", { name: "명함 목록" })).toBeVisible();
    }

    const notFoundResponse = await page.goto("/cards/00000000-0000-4000-8000-000000000099");
    expect(notFoundResponse?.status() ?? 0).toBeGreaterThanOrEqual(400);

    await page.route("**/api/ask", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "upstream_unavailable" }) }));
    await page.goto("/ask");
    const question = page.getByRole("textbox");
    if (await question.count()) {
      await question.fill("테스트 질문");
      await page.getByRole("button", { name: "질문하기" }).click();
      await expect(page.getByRole("alert")).toBeVisible();
      await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible();
    } else {
      await expect(page.getByRole("link", { name: /설정에서/ })).toBeVisible();
    }
  });
});
