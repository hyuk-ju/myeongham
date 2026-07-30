import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const hasCredentials = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "CLERK_TESTING_TOKEN",
  "CLERK_FAPI",
  "DEV_LOGIN_USER_ID",
  "ALLOWED_USER_IDS",
].every((name) => Boolean(process.env[name]));

test("failed draft retains its image and edits after failure, then finalizes once", async ({ page }) => {
  test.skip(!hasCredentials, "credential_gate");
  const draftsResponse = await page.request.get("/api/drafts");
  expect(draftsResponse.status()).toBe(200);
  const failedId = findFailedDraftId(await draftsResponse.json());
  test.skip(failedId === null, "fixture_gate: an authenticated failed draft is required");
  if (failedId === null) return;

  await page.goto("/capture/review");
  const image = page.getByRole("img", { name: "명함" });
  await expect(image).toBeVisible();
  const originalImageUrl = await image.getAttribute("src");
  expect(originalImageUrl).toBeTruthy();
  await expect(page.getByText("직접 입력", { exact: false })).toBeVisible();

  const company = page.getByLabel("회사");
  await company.fill("Todo6 수동 복구 회사");
  let failNextSave = true;
  await page.route("**/api/cards", async (route) => {
    if (!failNextSave) {
      await route.continue();
      return;
    }
    failNextSave = false;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "transaction_failed" }),
    });
  });

  const failedResponse = page.waitForResponse((response) => isCardSave(response));
  await page.getByRole("button", { name: "저장하고 다음 장" }).click();
  expect((await failedResponse).status()).toBe(503);
  await expect(page.getByText("transaction_failed", { exact: true })).toBeVisible();
  await expect(company).toHaveValue("Todo6 수동 복구 회사");
  await expect(image).toHaveAttribute("src", originalImageUrl ?? "");
  await page.screenshot({ path: resolve(process.env.E2E_RUN_ROOT ?? "", "task-6-manual-finalize.png") });

  const successResponse = page.waitForResponse((response) => isCardSave(response));
  await page.getByRole("button", { name: "저장하고 다음 장" }).click();
  const savedResponse = await successResponse;
  expect(savedResponse.status()).toBe(200);
  const savedId = readId(await savedResponse.json());
  expect(savedId).not.toBeNull();

  const remaining = await page.request.get("/api/drafts");
  expect(remaining.status()).toBe(200);
  expect(findDraftId(await remaining.json(), failedId)).toBe(false);
  await page.goto("/cards");
  await expect(page.getByText("Todo6 수동 복구 회사", { exact: true })).toHaveCount(1);
});

function isCardSave(response: { url(): string; request(): { method(): string } }): boolean {
  return response.url().endsWith("/api/cards") && response.request().method() === "POST";
}

function findFailedDraftId(value: unknown): string | null {
  const record = asRecord(value);
  const drafts = record?.drafts;
  if (!Array.isArray(drafts)) return null;
  for (const item of drafts) {
    const row = asRecord(item);
    if (row?.status === "failed" && typeof row.id === "string") return row.id;
  }
  return null;
}

function findDraftId(value: unknown, expected: string): boolean {
  const record = asRecord(value);
  const drafts = record?.drafts;
  return Array.isArray(drafts) && drafts.some((item) => asRecord(item)?.id === expected);
}

function readId(value: unknown): string | null {
  const id = asRecord(value)?.id;
  return typeof id === "string" ? id : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}
