import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const hasCredentials = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY", "CLERK_TESTING_TOKEN", "CLERK_FAPI", "DEV_LOGIN_USER_ID",
].every((name) => Boolean(process.env[name]));

test("authenticated user uploads a real card, reviews the original, edits OCR, and saves", async ({ page }) => {
  test.skip(!hasCredentials, "credential_gate");
  const upload = await page.request.post("/api/drafts", {
    multipart: {
      image: {
        name: "capture-review-journey.jpg",
        mimeType: "image/jpeg",
        buffer: await readFile(resolve(process.cwd(), "tests/fixtures/cards/valid-jpeg.jpg")),
      },
    },
  });
  expect(upload.status()).toBe(201);
  const uploaded: unknown = await upload.json();
  const draftId = readString(uploaded, "id");
  expect(draftId).not.toBeNull();

  await page.goto("/capture/review");
  const image = page.getByRole("img", { name: "명함" });
  await expect(image).toBeVisible();
  const originalSrc = await image.getAttribute("src");
  expect(originalSrc).toBeTruthy();
  await expect(page.getByRole("heading", { name: "필수 확인" })).toBeVisible();

  const company = page.getByLabel("회사");
  await company.fill("실제 픽셀 검증 회사");
  await expect(company).toHaveValue("실제 픽셀 검증 회사");
  await expect(image).toHaveAttribute("src", originalSrc ?? "");

  const saveResponse = page.waitForResponse((response) => response.url().endsWith("/api/cards") && response.request().method() === "POST");
  await page.getByRole("button", { name: "저장하고 다음 장" }).click();
  expect((await saveResponse).status()).toBe(200);
  await expect(page.getByText("검토할 명함이 없습니다.")).toBeVisible();
  expect(draftId).toMatch(/^[0-9a-f-]{36}$/i);
});

function readString(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = Object.fromEntries(Object.entries(value))[key];
  return typeof candidate === "string" ? candidate : null;
}
