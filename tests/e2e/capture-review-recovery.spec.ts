import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const hasCredentials = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY", "CLERK_TESTING_TOKEN", "CLERK_FAPI", "DEV_LOGIN_USER_ID",
].every((name) => Boolean(process.env[name]));

test("provider failure and finalize failure retain the original image and manual edits", async ({ page }) => {
  test.skip(!hasCredentials, "credential_gate");
  const invalid = await page.request.post("/api/drafts", {
    multipart: {
      image: {
        name: "spoofed.jpg",
        mimeType: "image/jpeg",
        buffer: await readFile(resolve(process.cwd(), "tests/fixtures/cards/spoofed-jpeg.jpg")),
      },
    },
  });
  expect(invalid.status()).toBe(415);

  const upload = await page.request.post("/api/drafts", {
    multipart: {
      image: {
        name: "capture-review-recovery.jpg",
        mimeType: "image/jpeg",
        buffer: await readFile(resolve(process.cwd(), "tests/fixtures/cards/valid-jpeg.jpg")),
      },
    },
  });
  expect(upload.status()).toBe(201);
  const uploaded: unknown = await upload.json();
  const draftId = readString(uploaded, "id");
  expect(draftId).not.toBeNull();
  if (draftId === null) return;

  let interrupted = true;
  await page.route(`**/api/drafts/${draftId}/extract`, async (route) => {
    if (interrupted) {
      interrupted = false;
      await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "busy", code: "busy" }) });
      return;
    }
    await route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "provider_unconfigured" }) });
  });
  await page.goto("/capture/review");
  await expect(page.getByRole("alert")).toContainText("provider_unconfigured");
  const image = page.getByRole("img", { name: "명함" });
  const originalSrc = await image.getAttribute("src");
  const company = page.getByLabel("회사");
  await page.getByRole("button", { name: "AI 다시 시도" }).click();
  await expect(page.getByRole("alert")).toContainText("provider_unconfigured");
  await company.fill("복구 중에도 보존되는 수정");

  let firstFinalize = true;
  await page.route("**/api/cards", async (route) => {
    if (firstFinalize) {
      firstFinalize = false;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "transaction_failed" }) });
      return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "저장하고 다음 장" }).click();
  await expect(page.getByRole("alert")).toContainText("transaction_failed");
  await expect(company).toHaveValue("복구 중에도 보존되는 수정");
  await expect(image).toHaveAttribute("src", originalSrc ?? "");

  await page.unroute(`**/api/drafts/${draftId}/extract`);
  await page.getByRole("button", { name: "저장하고 다음 장" }).click();
  await expect(page.getByText("검토할 명함이 없습니다.")).toBeVisible();
});

function readString(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = Object.fromEntries(Object.entries(value))[key];
  return typeof candidate === "string" ? candidate : null;
}
