import { expect, test } from "@playwright/experimental-ct-react";
import AxeBuilder from "@axe-core/playwright";
import { EnrichView, type EnrichViewRow } from "@/app/(tabs)/enrich/enrich-view";
import { EnrichPanel } from "@/components/enrich-panel";
import { SettingsFixture } from "./settings-fixture";

const row: EnrichViewRow = {
  company: "긴 회사 이름과 아주 긴 URL을 확인하는 예시 회사",
  missing: 2,
  total: 4,
  status: "ready",
  suggestion: {
    industry: "정밀 제조",
    capabilities: ["CNC", "AOI"],
    summary: "출처를 확인한 뒤 선택한 태그만 적용합니다.",
    confident: false,
    sources: [{ url: "https://example.com/a/very-long-company-source-path-that-must-wrap", title: "공식 홈페이지 출처" }],
  },
  picked: [],
  error: null,
  updated: 0,
};

function viewProps() {
  return {
    rows: [row], running: false, stoppedCode: null, filter: "all" as const,
    onFilterChange: () => undefined, onStart: () => undefined, onStop: () => undefined,
    onRetryFailed: () => undefined, onToggle: () => undefined, onApply: () => undefined,
  };
}

test("Todo10 EnrichView 375px keyboard/source evidence", async ({ mount, page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await mount(<EnrichView {...viewProps()} />);
  await expect(page.getByText("1/1 처리됨")).toBeVisible();
  await page.getByText("출처 1건 보기").press("Enter");
  await expect(page.getByRole("link", { name: "공식 홈페이지 출처" })).toBeVisible();
  const audit = await new AxeBuilder({ page }).include('[data-testid="ct-production-styles"]').analyze();
  expect(audit.violations).toEqual([]);
  await page.screenshot({ path: ".omo/evidence/business-card-priority-fixes/task-10-enrich-settings-375.png", fullPage: true });
});

test("Todo10 EnrichPanel action targets and source disclosure", async ({ mount, page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await mount(
    <EnrichPanel
      subject={{ company: "예시 회사", company_en: null, website: null, address: null, tax_code: null }}
      currentIndustry={null}
      currentCapabilities={[]}
      initial={row.suggestion}
      onApply={() => undefined}
    />,
  );
  await expect(page.getByRole("button", { name: "검색" })).toHaveClass(/ui-action/);
  await expect(page.getByRole("button", { name: "+ CNC" })).toHaveClass(/min-h-11/);
  await page.getByText("출처 1건 보기").press("Enter");
  await expect(page.getByRole("link", { name: "공식 홈페이지 출처" })).toBeVisible();
  const audit = await new AxeBuilder({ page }).include('[data-testid="ct-production-styles"]').analyze();
  expect(audit.violations).toEqual([]);
  await page.screenshot({ path: ".omo/evidence/business-card-priority-fixes/task-10-enrich-panel-375.png", fullPage: true });
});

for (const [width, screenshot] of [
  [375, "task-10-settings-375.png"],
  [768, "task-10-settings-768.png"],
  [1280, "task-10-settings-1280.png"],
] as const) {
  test(`Todo10 real settings surface ${width}px`, async ({ mount, page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/chatgpt/start", async (route) => route.fulfill({ json: { authorizeUrl: "https://example.com/oauth" } }));
    await mount(<SettingsFixture />);
    await expect(page.getByRole("heading", { name: "서버 소유 OpenAI API" })).toBeVisible();
    await expect(page.getByText("ChatGPT 구독과 별도입니다.")).toBeVisible();
    await expect(page.getByText("비공식·실험", { exact: true })).toBeVisible();
    await expect(page.getByText(/실패 시 자동 전환하지 않으며/)).toBeVisible();
    await expect(page.getByText("마스킹 계정 ac•••42")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("OPENAI_API_KEY");

    const actionHeights = await page.locator("button.ui-action").evaluateAll((buttons) => buttons.map((button) => Math.round(button.getBoundingClientRect().height)));
    expect(actionHeights.every((height) => height >= 44)).toBe(true);

    await page.getByRole("button", { name: "해제" }).click();
    await expect(page.getByRole("button", { name: "해제 확인" })).toBeVisible();
    await page.screenshot({ path: `.omo/evidence/business-card-priority-fixes/${screenshot.replace(".png", "-disconnect.png")}`, fullPage: true });
    await page.getByRole("button", { name: "다시 연결" }).click();
    await expect(page.getByPlaceholder(/localhost:1455/)).toBeVisible();
    await page.getByPlaceholder(/localhost:1455/).fill("http://localhost:1455/auth/callback?code=synthetic&state=synthetic");
    await expect(page.getByRole("button", { name: "연결 완료" })).toBeEnabled();

    const audit = await new AxeBuilder({ page }).include('[data-testid="ct-production-styles"]').analyze();
    expect(audit.violations).toEqual([]);
    await page.screenshot({ path: `.omo/evidence/business-card-priority-fixes/${screenshot}`, fullPage: true });
  });
}

test("Todo10 EnrichView 768px state matrix at 200% zoom", async ({ mount, page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await mount(
    <div className="space-y-4">
      <EnrichView {...viewProps()} running />
      <EnrichView {...viewProps()} rows={[]} />
      <EnrichView {...viewProps()} stoppedCode="rate_limited" />
      <EnrichView {...viewProps()} rows={[{ ...row, status: "applied", picked: ["CNC"], updated: 4 }]} />
    </div>,
  );
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await expect(page.getByRole("status").first()).toBeVisible();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: row.company }).first()).toHaveCSS("word-break", "keep-all");
  await expect(page.getByText("검토 필요", { exact: true }).first()).toHaveCSS("white-space", "nowrap");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(overflow).toBe(true);
  const audit = await new AxeBuilder({ page }).include('[data-testid="ct-production-styles"]').analyze();
  expect(audit.violations).toEqual([]);
  await page.screenshot({ path: ".omo/evidence/business-card-priority-fixes/task-10-enrich-settings-768.png", fullPage: true });
});
