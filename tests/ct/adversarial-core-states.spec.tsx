import { expect, test } from "@playwright/experimental-ct-react";
import { AskView } from "@/app/(tabs)/ask/ask-client";
import { EnrichView, type EnrichViewRow } from "@/app/(tabs)/enrich/enrich-view";
import { CaptureView } from "@/app/capture/capture-client";
import type { DraftQueueActions, DraftQueueSnapshot } from "@/lib/draft-queue-state";

const actions: DraftQueueActions = {
  add: async () => undefined,
  retryUpload: async () => undefined,
  discardUpload: () => undefined,
  refresh: async () => undefined,
  retry: async () => undefined,
  retryFailed: async () => undefined,
  discard: async () => undefined,
  acknowledgeFinalized: async () => undefined,
};

const baseQueue: DraftQueueSnapshot = {
  drafts: [], uploads: [], uploading: 0, loading: false, analyzingId: null,
  enrichingCompany: null, errorCode: null, stopCode: null, ready: [], failed: [], waiting: [], processing: [],
};

const failedQueue: DraftQueueSnapshot = {
  ...baseQueue,
  errorCode: "unsupported_media",
  stopCode: "provider_unconfigured",
  failed: [{
    id: "00000000-0000-4000-8000-000000000031", image_path: "synthetic.jpg", image_url: null,
    status: "failed", extracted: null, error: "provider_unconfigured", attempts: 1, enrich: null,
    created_at: "2026-01-01T00:00:00.000Z",
  }],
  drafts: [{
    id: "00000000-0000-4000-8000-000000000031", image_path: "synthetic.jpg", image_url: null,
    status: "failed", extracted: null, error: "provider_unconfigured", attempts: 1, enrich: null,
    created_at: "2026-01-01T00:00:00.000Z",
  }],
};

const stoppedRow: EnrichViewRow = {
  company: "오프라인 합성 회사",
  missing: 1,
  total: 1,
  status: "waiting",
  suggestion: null,
  picked: [],
  error: null,
  updated: 0,
};

for (const width of [375, 768, 1280]) {
  test(`adversarial recovery states remain actionable at ${width}px and 200% zoom`, async ({ mount, page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => { document.body.style.zoom = "2"; });

    const capture = await mount(<CaptureView connected snapshot={failedQueue} actions={actions} />);
    await expect(capture.getByRole("alert").filter({ hasText: "지원하지 않는 이미지 형식" })).toBeVisible();
    await expect(capture.getByRole("button", { name: "다시 시도" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await capture.unmount();

    const enrich = await mount(<EnrichView rows={[stoppedRow]} running={false} stoppedCode="provider_unconfigured" filter="all" onFilterChange={() => undefined} onStart={() => undefined} onStop={() => undefined} onRetryFailed={() => undefined} onToggle={() => undefined} onApply={() => undefined} />);
    await expect(enrich.getByRole("alert")).toContainText("설정되지 않아");
    await expect(enrich.getByRole("button", { name: "검색 계속하기" })).toBeVisible();
    await enrich.unmount();

    const ask = await mount(<AskView onAsk={async () => { throw new Error("synthetic offline"); }} />);
    await ask.getByRole("textbox").fill("초장문 질문이 화면 밖으로 나가지 않는지 확인하는 합성 입력");
    await ask.getByRole("button", { name: "질문하기" }).click();
    await expect(ask.getByRole("alert")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await ask.screenshot({ path: `.omo/evidence/business-card-priority-fixes/task-11-adversarial-${width}.png`, animations: "disabled" });
  });
}
