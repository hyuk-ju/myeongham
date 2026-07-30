import { expect, test } from "@playwright/experimental-ct-react";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CaptureView } from "@/app/capture/capture-client";
import { ReviewView } from "@/app/capture/review/review-client";
import type { DraftQueueActions, DraftQueueSnapshot } from "@/lib/draft-queue-state";
import type { DraftRow } from "@/lib/drafts";

const fixtureDataUrl = (name: string, mime: string): string => `data:${mime};base64,${readFileSync(resolve("tests/fixtures/cards", name)).toString("base64")}`;
const jpegUrl = fixtureDataUrl("valid-jpeg.jpg", "image/jpeg");
const pngUrl = fixtureDataUrl("valid-png.png", "image/png");

const card: DraftRow = {
  id: "00000000-0000-4000-8000-000000000001", image_path: "synthetic-card.jpg", image_url: pngUrl, status: "extracted",
  extracted: { company: "샘플 제조", name: "홍길동", title: "구매팀", department: null, mobile: "010-0000-0000", phone: null, email: "sample@example.test", website: null, address: null, industry: "제조", capabilities: ["정밀가공"], confidence: 0.82, name_en: null, company_en: null, mobile2: null, fax: null, email2: null, postal_code: null, tax_code: null, raw_text: null },
  error: null, attempts: 0, enrich: null, created_at: "2026-01-01T00:00:00.000Z",
};

const snapshot: DraftQueueSnapshot = {
  drafts: [card], uploads: [{ localId: "upload-1", previewUrl: jpegUrl, status: "uploading", errorCode: null }], uploading: 1, loading: false, analyzingId: null, enrichingCompany: null, errorCode: null, stopCode: null,
  ready: [card], failed: [], waiting: [], processing: [],
};

const actions: DraftQueueActions = {
  add: async () => undefined, retryUpload: async () => undefined, discardUpload: () => undefined, refresh: async () => undefined,
  retry: async () => undefined, retryFailed: async () => undefined, discard: async () => undefined, acknowledgeFinalized: async () => undefined,
};

for (const width of [375, 768, 1280]) {
  test(`capture and review surfaces stay readable at ${width}px`, async ({ mount, page }) => {
    await page.setViewportSize({ width, height: 900 });
    const capture = await mount(<main><h1 className="sr-only">명함 검토</h1><CaptureView connected snapshot={snapshot} actions={actions} /></main>);
    await expect(capture).toContainText("검토 시작");
    await expect(capture.getByAltText("업로드할 명함 미리보기")).toBeVisible();
    await expect(capture.getByAltText("보관된 명함 미리보기")).toBeVisible();
    await capture.screenshot({ path: `.omo/evidence/business-card-priority-fixes/task-9-capture-${width}.png`, animations: "disabled" });
    await capture.unmount();

    const review = await mount(<main><h1 className="sr-only">명함 검토</h1><ReviewView snapshot={snapshot} actions={actions} knownTags={["정밀가공"]} /></main>);
    await expect(review.getByRole("heading", { name: "필수 확인" })).toBeVisible();
    await expect(review.getByRole("button", { name: "저장하고 다음 장" })).toBeVisible();
    await expect(review.getByRole("img", { name: "명함" })).toBeVisible();
    const clearTags = review.getByRole("button", { name: "전부 지우기" });
    await expect(clearTags).toBeVisible();
    await expect(clearTags).toHaveCSS("white-space", "nowrap");
    expect((await clearTags.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(44);
    const footerBox = await review.locator("footer").boundingBox();
    const formBox = await review.getByRole("heading", { name: "추가 정보" }).boundingBox();
    expect(footerBox?.y ?? 0).toBeGreaterThan(formBox?.y ?? -1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await review.screenshot({ path: `.omo/evidence/business-card-priority-fixes/task-9-capture-review-${width}.png`, animations: "disabled" });
  });
}

test("review recovery states expose an actionable status without network", async ({ mount, page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  const longExtracted = card.extracted === null ? null : { ...card.extracted, company: "株式会社サンプル 제조 서비스 데이터가 아주 길게 이어지는 토큰_without_breaks_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" };
  const states: readonly DraftQueueSnapshot[] = [
    { ...snapshot, drafts: [], ready: [], uploads: [], uploading: 0 },
    { ...snapshot, loading: true, drafts: [], ready: [], uploads: [], uploading: 0 },
    { ...snapshot, errorCode: "network_error" },
    { ...snapshot, drafts: [{ ...card, status: "failed", extracted: null, error: "provider_unconfigured" }], ready: [], failed: [{ ...card, status: "failed", extracted: null, error: "provider_unconfigured" }] },
    { ...snapshot, drafts: [{ ...card, extracted: longExtracted }], ready: [{ ...card, extracted: longExtracted }] },
  ];
  for (const state of states) {
    const view = await mount(<main><h1 className="sr-only">명함 검토</h1><ReviewView snapshot={state} actions={actions} knownTags={[]} /></main>);
    await expect(view).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await view.unmount();
  }
  const errorView = await mount(<main><h1 className="sr-only">명함 검토</h1><CaptureView connected snapshot={{ ...snapshot, errorCode: "network_error" }} actions={actions} /></main>);
  await expect(errorView.getByRole("alert")).toContainText("네트워크");
});

test("review keeps focused fields reachable at 200 percent zoom", async ({ mount, page }) => {
  await page.setViewportSize({ width: 750, height: 900 });
  const view = await mount(<main><h1 className="sr-only">명함 검토</h1><ReviewView snapshot={snapshot} actions={actions} knownTags={[]} /></main>);
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  const company = view.getByLabel("회사");
  await company.scrollIntoViewIfNeeded();
  await company.focus();
  const box = await company.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect(box?.y ?? 9999).toBeLessThan(900);
  await view.screenshot({ path: ".omo/evidence/business-card-priority-fixes/task-9-capture-review-200pct.png", animations: "disabled" });
});
