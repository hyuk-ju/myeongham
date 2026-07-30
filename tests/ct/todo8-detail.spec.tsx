import { expect, test } from "@playwright/experimental-ct-react";
import AxeBuilder from "@axe-core/playwright";
import { EMPTY_DRAFT } from "@/app/capture/card-form";
import { CardDetailView, type CardRow } from "@/app/(tabs)/cards/[id]/card-detail";
import { CardsWorkspaceView } from "@/app/(tabs)/cards/page";

const card: CardRow = {
  ...EMPTY_DRAFT,
  id: "00000000-0000-4000-8000-000000000001",
  company: "株式会社サンプル 제조 서비스 데이터가 아주 길게 이어지는 토큰_without_breaks_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  name: "홍길동",
  title: "구매팀",
  mobile: "010-0000-0000",
  email: "sample@example.test",
  capabilities: ["정밀가공", "긴태그_without_breaks_aaaaaaaaaaaaaaaaaaaaaaaa"],
  created_at: "2026-01-01T00:00:00.000Z",
  is_current: true,
  supersedes_id: null,
};
for (const width of [375, 768, 1280]) {
  test(`CardDetailView states stay reachable at ${width}px`, async ({ mount, page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/cards/company-capabilities**", (route) => route.abort());
    const view = await mount(<CardDetailView card={card} imageUrl={null} knownTags={["정밀가공"]} colleagues={[]} previousCard={null} replacedBy={null} />);
    await expect(view).toBeVisible();
    await expect(view.getByRole("heading", { name: "필수 확인" })).toBeVisible();
    await expect(view.getByRole("link", { name: /전화 걸기/ })).toBeVisible();
    await expect(view.getByRole("alert")).toContainText("이미지를 불러오지 못했습니다");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await view.screenshot({ path: `.omo/evidence/business-card-priority-fixes/task-8-detail-${width}.png`, animations: "disabled" });

    await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const companyInput = view.getByRole("textbox", { name: "회사 OCR" });
    await expect(view.locator("#card-mobile")).toHaveValue("010-0000-0000");
    await expect(view.locator("#card-email")).toHaveValue("sample@example.test");
    await companyInput.scrollIntoViewIfNeeded();
    await companyInput.focus();
    await expect(companyInput).toBeFocused();
    await view.screenshot({ path: `.omo/evidence/business-card-priority-fixes/task-8-detail-200pct-${width}.png`, animations: "disabled" });
    await view.unmount();

    const loading = await mount(<CardDetailView card={card} imageUrl={null} knownTags={[]} colleagues={[]} previousCard={null} replacedBy={null} viewState="loading" />);
    await expect(loading.getByRole("status")).toContainText("불러오는 중");
    await loading.unmount();
    const error = await mount(<CardDetailView card={card} imageUrl={null} knownTags={[]} colleagues={[]} previousCard={null} replacedBy={null} viewState="error" />);
    await expect(error.getByRole("alert")).toContainText("불러오지 못했습니다");
    await expect(error.getByRole("link", { name: "명함 목록" })).toHaveAttribute("href", "/cards");
    await error.unmount();

    const fallback = await mount(<CardsWorkspaceView cards={[]} total={0} hasMore={false} page={1} q="missing" filter="all" tag="" company="" topTags={[]} companyCounts={{}} />);
    await expect(fallback.getByRole("heading", { name: "조건에 맞는 명함이 없습니다" })).toBeVisible();
  });
}
