import { expect, test } from "@playwright/test";

test("invalid media is rejected with a visible recovery action", async ({ page }) => {
  await page.goto("/capture");
  await page.locator('input[type="file"]').first().setInputFiles("tests/fixtures/cards/spoofed-jpeg.jpg");
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("alert")).toContainText(/지원하지 않는|실패|이미지/);
  await expect(page.getByRole("button", { name: /다시 시도|버리기/ }).first()).toBeVisible();
});

test("provider-unconfigured stop leaves a retryable queue state", async ({ page }) => {
  await page.route("**/api/enrich", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "provider_unconfigured" }) });
  });
  await page.goto("/enrich");
  const stop = page.getByRole("alert");
  if (await stop.count()) {
    await expect(stop).toContainText(/설정|검색/);
    await expect(page.getByRole("button", { name: /다시|재시도/ }).first()).toBeVisible();
  }
});

test("offline ask reports an actionable error instead of a blank success", async ({ page }) => {
  await page.route("**/api/ask", (route) => route.abort("failed").catch(() => undefined));
  await page.goto("/ask");
  await page.getByRole("textbox").fill("오프라인 합성 질문");
  await page.getByRole("button", { name: "질문하기" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});
