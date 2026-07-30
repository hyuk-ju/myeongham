import { expect, test } from "@playwright/experimental-ct-react";
import AxeBuilder from "@axe-core/playwright";
import { HomeView } from "@/app/(tabs)/page";
import { CardsWorkspaceView, type CardsWorkspaceCard } from "@/app/(tabs)/cards/page";
import { AskView } from "@/app/(tabs)/ask/ask-client";

const card: CardsWorkspaceCard = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "홍길동",
  company: "샘플 제조",
  title: "구매팀",
  department: "영업",
  mobile: "010-0000-0000",
  mobile2: null,
  phone: null,
  email: "sample@example.test",
  capabilities: ["정밀가공", "장비 제작"],
  is_current: true,
  created_at: "2026-01-01T00:00:00.000Z",
};

for (const width of [375, 768, 1280]) {
  test(`Todo8 core views stay usable at ${width}px`, async ({ mount, page }) => {
    await page.setViewportSize({ width, height: 900 });
    const home = await mount(<HomeView total={1} untagged={0} aiAvailable={true} drafts={{ pending: 0, processing: 0, failed: 0, extracted: 0 }} recent={[card]} />);
    await expect(home.getByRole("heading", { name: "오늘 할 일" })).toBeVisible();
    await expect(home.getByRole("link", { name: "전화 걸기" })).toBeVisible();
    await home.screenshot({ path: `.omo/evidence/business-card-priority-fixes/task-8-home-${width}.png`, animations: "disabled" });
    await home.screenshot({ path: `.omo/evidence/business-card-priority-fixes/task-8-core-flow-${width}.png`, animations: "disabled" });
    await home.unmount();

    const recoveryHome = await mount(<HomeView total={1} untagged={0} aiAvailable={true} drafts={{ pending: 0, processing: 0, failed: 1, extracted: 0 }} recent={[]} />);
    await expect(recoveryHome.getByText("실패한 분석 1장")).toBeVisible();
    await recoveryHome.screenshot({ path: `.omo/evidence/business-card-priority-fixes/task-8-home-recovery-${width}.png`, animations: "disabled" });
    await recoveryHome.unmount();

    const cards = await mount(<CardsWorkspaceView cards={[card]} total={1} hasMore={false} page={1} q="" filter="all" tag="" company="" topTags={["정밀가공"]} companyCounts={{ "샘플 제조": 1 }} />);
    await expect(cards.getByRole("heading", { name: "명함" })).toBeVisible();
    await expect(cards.getByRole("link", { name: "샘플 제조 상세 보기" })).toBeVisible();
    await cards.screenshot({ path: `.omo/evidence/business-card-priority-fixes/task-8-cards-${width}.png`, animations: "disabled" });
    await cards.unmount();

    const emptyCards = await mount(<CardsWorkspaceView cards={[]} total={0} hasMore={false} page={1} q="없는 회사" filter="all" tag="" company="" topTags={[]} companyCounts={{}} />);
    await expect(emptyCards.getByRole("heading", { name: "조건에 맞는 명함이 없습니다" })).toBeVisible();
    await emptyCards.screenshot({ path: `.omo/evidence/business-card-priority-fixes/task-8-cards-empty-${width}.png`, animations: "disabled" });
    await emptyCards.unmount();

    const ask = await mount(<main className="mx-auto w-full max-w-2xl px-5 pb-10 pt-8"><header className="mb-5"><h1 className="text-[22px] font-bold tracking-tight">물어보기</h1><p className="mt-0.5 text-sm text-soft">등록한 명함에서 찾아 표로 정리해 드립니다.</p></header><AskView initialResult={{ rows: [], note: "결과가 없습니다.", candidateCount: 0 }} onAsk={async () => { throw new Error("synthetic upstream"); }} /></main>);
    await expect(ask.getByRole("heading", { name: "맞는 명함을 찾지 못했습니다" })).toBeVisible();
    await ask.screenshot({ path: `.omo/evidence/business-card-priority-fixes/task-8-ask-${width}.png`, animations: "disabled" });
    await page.keyboard.press("Tab");
    await expect(ask.getByRole("textbox")).toBeFocused();
    await ask.screenshot({ path: `.omo/evidence/business-card-priority-fixes/task-8-ask-focus-${width}.png`, animations: "disabled" });
    await ask.getByRole("textbox").fill("테스트 질문");
    await ask.getByRole("button", { name: "질문하기" }).click();
    await expect(ask.getByRole("alert")).toBeVisible();
    await ask.screenshot({ path: `.omo/evidence/business-card-priority-fixes/task-8-ask-error-${width}.png`, animations: "disabled" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
