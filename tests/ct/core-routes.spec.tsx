import { expect, test } from "@playwright/experimental-ct-react";
import { AskView } from "@/app/(tabs)/ask/ask-client";
import { CardsWorkspaceView, type CardsWorkspaceCard } from "@/app/(tabs)/cards/page";
import { CardDetailView, type CardRow } from "@/app/(tabs)/cards/[id]/card-detail";
import { EnrichView, type EnrichViewRow } from "@/app/(tabs)/enrich/enrich-view";
import { HomeView } from "@/app/(tabs)/page";
import { CaptureView } from "@/app/capture/capture-client";
import { ReviewView } from "@/app/capture/review/review-client";
import { SettingsView } from "@/app/(tabs)/settings/settings-view";
import { EMPTY_DRAFT } from "@/app/capture/card-form";
import type { DraftQueueActions, DraftQueueSnapshot } from "@/lib/draft-queue-state";
import type { AISettings } from "@/lib/ai/settings-store";

const card: CardsWorkspaceCard = {
  id: "00000000-0000-4000-8000-000000000011",
  name: "홍길동",
  company: "아주 긴 회사 이름을 가진 샘플 제조 주식회사",
  title: "구매팀 책임자",
  department: "글로벌 장비 조달",
  mobile: "010-0000-0000",
  mobile2: null,
  phone: null,
  email: "sample@example.test",
  capabilities: ["정밀가공", "장비 제작", "초장문 태그가 줄바꿈되어야 합니다"],
  is_current: true,
  created_at: "2026-01-01T00:00:00.000Z",
};

const detailCard: CardRow = {
  ...EMPTY_DRAFT,
  id: card.id,
  created_at: card.created_at,
  is_current: true,
  supersedes_id: null,
  name: card.name,
  company: card.company,
  title: card.title,
  department: card.department,
  mobile: card.mobile,
  email: card.email,
  capabilities: [...card.capabilities],
};

const emptyActions: DraftQueueActions = {
  add: async () => undefined,
  retryUpload: async () => undefined,
  discardUpload: () => undefined,
  refresh: async () => undefined,
  retry: async () => undefined,
  retryFailed: async () => undefined,
  discard: async () => undefined,
  acknowledgeFinalized: async () => undefined,
};

const draft = {
  id: "00000000-0000-4000-8000-000000000021",
  image_path: "cards/synthetic.png",
  image_url: null,
  status: "extracted" as const,
  extracted: {
    name: "홍길동",
    name_en: null,
    title: "구매팀",
    department: null,
    company: "샘플 제조",
    company_en: null,
    phone: null,
    mobile: "010-0000-0000",
    mobile2: null,
    fax: null,
    email: "sample@example.test",
    email2: null,
    website: null,
    address: null,
    postal_code: null,
    tax_code: null,
    raw_text: "synthetic fixture",
    industry: null,
    capabilities: [],
    confidence: 0.9,
    notes: null,
    met_at: null,
    met_context: null,
  },
  error: null,
  attempts: 1,
  enrich: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

const queue: DraftQueueSnapshot = {
  drafts: [draft],
  uploads: [],
  uploading: 0,
  loading: false,
  analyzingId: null,
  enrichingCompany: null,
  errorCode: null,
  stopCode: null,
  ready: [draft],
  failed: [],
  waiting: [],
  processing: [],
};

const enrichRow: EnrichViewRow = {
  company: "아주 긴 회사 이름을 가진 샘플 제조 주식회사",
  missing: 2,
  total: 3,
  status: "ready",
  suggestion: {
    industry: "산업 장비",
    capabilities: ["정밀가공", "장비 제작"],
    summary: "공식 출처를 확인한 합성 제안입니다.",
    confident: true,
    sources: [{ url: "https://example.test/company", title: "합성 출처" }],
  },
  picked: ["정밀가공"],
  error: null,
  updated: 1,
};

const settings: AISettings = {
  extract: { provider: null, model: null },
  ask: { provider: null, model: null },
  enrich: { provider: "openai-codex", model: null },
};

const noop = () => undefined;

for (const width of [375, 768, 1280]) {
  test(`core routes render the DESIGN contract at ${width}px`, async ({ mount, page }) => {
    await page.setViewportSize({ width, height: 900 });
    const home = await mount(
      <HomeView total={1} untagged={1} aiAvailable={false} drafts={{ pending: 1, processing: 0, failed: 0, extracted: 0 }} recent={[card]} />,
    );
    await expect(home.getByRole("heading", { name: "오늘 할 일" })).toBeVisible();
    await home.screenshot({ path: `.omo/evidence/business-card-priority-fixes/task-11-core-home-${width}.png`, animations: "disabled" });
    await home.unmount();

    const cards = await mount(<CardsWorkspaceView cards={[card]} total={1} hasMore={false} page={1} q="" filter="all" tag="" company="" topTags={card.capabilities} companyCounts={{ [card.company ?? ""]: 1 }} />);
    await expect(cards.getByRole("heading", { name: "명함" })).toBeVisible();
    await cards.screenshot({ path: `.omo/evidence/business-card-priority-fixes/task-11-core-cards-${width}.png`, animations: "disabled" });
    await cards.unmount();

    const capture = await mount(<CaptureView connected snapshot={queue} actions={emptyActions} />);
    await expect(capture.getByText("검토 시작")).toBeVisible();
    await capture.screenshot({ path: `.omo/evidence/business-card-priority-fixes/task-11-core-capture-${width}.png`, animations: "disabled" });
    await capture.unmount();

    const review = await mount(<ReviewView snapshot={queue} actions={emptyActions} knownTags={["정밀가공"]} />);
    await expect(review.getByText("확인 대기 1장")).toBeVisible();
    await review.screenshot({ path: `.omo/evidence/business-card-priority-fixes/task-11-core-review-${width}.png`, animations: "disabled" });
    await review.unmount();

    const detail = await mount(<CardDetailView card={detailCard} imageUrl={null} knownTags={["정밀가공"]} colleagues={[]} previousCard={null} replacedBy={null} />);
    await expect(detail.getByRole("heading", { name: /샘플 제조/ })).toBeVisible();
    await detail.screenshot({ path: `.omo/evidence/business-card-priority-fixes/task-11-core-detail-${width}.png`, animations: "disabled" });
    await detail.unmount();

    const enrich = await mount(<EnrichView rows={[enrichRow]} running={false} stoppedCode={null} filter="all" onFilterChange={noop} onStart={noop} onStop={noop} onRetryFailed={noop} onToggle={noop} onApply={noop} />);
    await expect(enrich.getByText("공식 출처를 확인한 합성 제안입니다.")).toBeVisible();
    await enrich.screenshot({ path: `.omo/evidence/business-card-priority-fixes/task-11-core-enrich-${width}.png`, animations: "disabled" });
    await enrich.unmount();

    const ask = await mount(<AskView initialResult={{ rows: [], note: "결과가 없습니다.", candidateCount: 0 }} onAsk={async () => ({ rows: [], note: "결과가 없습니다.", candidateCount: 0 })} />);
    await expect(ask.getByRole("heading", { name: "맞는 명함을 찾지 못했습니다" })).toBeVisible();
    await ask.screenshot({ path: `.omo/evidence/business-card-priority-fixes/task-11-core-ask-${width}.png`, animations: "disabled" });
    await ask.unmount();

    const settingsView = await mount(
      <SettingsView
        providers={[{ provider: "openai-codex", connected: false, active: false, accountId: null, expiresAt: null }]}
        catalog={[
          { provider: "openai-codex", kind: "oauth", label: "ChatGPT", models: [], connected: false, available: false },
          { provider: "openai-api", kind: "enrich", label: "OpenAI API", models: [{ id: "gpt-5", label: "GPT" }], connected: false, available: false },
        ]}
        initial={settings}
        defaultLabel={null}
        openAI={{ configured: false, model: "gpt-5" }}
        oauthContent={<p>합성 OAuth 상태</p>}
        modelContent={<p>합성 모델 선택</p>}
        accountContent={<p>합성 계정</p>}
      />,
    );
    await expect(settingsView.getByRole("heading", { name: "서버 소유 OpenAI API" })).toBeVisible();
    await settingsView.screenshot({ path: `.omo/evidence/business-card-priority-fixes/task-11-core-settings-${width}.png`, animations: "disabled" });
  });
}
