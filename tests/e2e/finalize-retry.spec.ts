import { expect, test } from "@playwright/test";

const hasCredentials = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "CLERK_TESTING_TOKEN",
  "CLERK_FAPI",
  "DEV_LOGIN_USER_ID",
  "ALLOWED_USER_IDS",
].every((name) => Boolean(process.env[name]));

test("transaction rejection preserves the failed draft and creates no card", async ({ page }) => {
  test.skip(!hasCredentials, "credential_gate");
  const failedId = await failedDraftId(page);
  test.skip(failedId === null, "fixture_gate: an authenticated failed draft is required");
  if (failedId === null) return;

  const response = await page.request.post("/api/cards", {
    data: {
      draft_id: failedId,
      supersedes_id: "00000000-0000-4000-8000-000000009999",
      company: "Todo6 rollback probe",
      confidence: 0,
    },
  });
  expect(response.status()).toBe(404);
  await expect(response.json()).resolves.toEqual({ error: "not_found" });

  const drafts = await page.request.get("/api/drafts");
  expect(drafts.status()).toBe(200);
  expect(findDraftStatus(await drafts.json(), failedId)).toBe("failed");
  await page.goto("/cards");
  await expect(page.getByText("Todo6 rollback probe", { exact: true })).toHaveCount(0);
});

test("a dropped successful response retries to the same card id without duplicate or premature acknowledgement", async ({ page }) => {
  test.skip(!hasCredentials, "credential_gate");
  const failedId = await failedDraftId(page);
  test.skip(failedId === null, "fixture_gate: an authenticated failed draft is required");
  if (failedId === null) return;

  let dropFirst = true;
  let firstCardId: string | null = null;
  await page.route("**/api/cards", async (route) => {
    if (!dropFirst) {
      await route.continue();
      return;
    }
    dropFirst = false;
    const response = await route.fetch();
    firstCardId = readId(await response.json());
    await route.abort("connectionreset");
  });

  await page.goto("/capture/review");
  const company = page.getByLabel("회사");
  await company.fill("Todo6 재시도 회사");
  const firstRequest = page.waitForResponse((response) => isCardSave(response));
  await page.getByRole("button", { name: "저장하고 다음 장" }).click();
  await firstRequest.catch(() => undefined);
  await expect(page.getByText("저장 여부를 확인하지 못했습니다", { exact: false })).toBeVisible();
  await expect(company).toHaveValue("Todo6 재시도 회사");
  await expect(page.getByRole("img", { name: "명함" })).toBeVisible();
  expect(firstCardId).not.toBeNull();

  const secondResponse = page.waitForResponse((response) => isCardSave(response));
  await page.getByRole("button", { name: "저장하고 다음 장" }).click();
  const savedResponse = await secondResponse;
  expect(savedResponse.status()).toBe(200);
  const secondCardId = readId(await savedResponse.json());
  expect(secondCardId).toBe(firstCardId);

  const drafts = await page.request.get("/api/drafts");
  expect(drafts.status()).toBe(200);
  expect(findDraftStatus(await drafts.json(), failedId)).toBeNull();
  await page.goto("/cards");
  await expect(page.getByText("Todo6 재시도 회사", { exact: true })).toHaveCount(1);
});

async function failedDraftId(page: { request: { get(url: string): Promise<{ json(): Promise<unknown> }> } }): Promise<string | null> {
  const response = await page.request.get("/api/drafts");
  return findFailedDraftId(await response.json());
}

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

function findDraftStatus(value: unknown, expected: string): string | null {
  const record = asRecord(value);
  const drafts = record?.drafts;
  if (!Array.isArray(drafts)) return null;
  for (const item of drafts) {
    const row = asRecord(item);
    if (row?.id === expected) return typeof row.status === "string" ? row.status : null;
  }
  return null;
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
