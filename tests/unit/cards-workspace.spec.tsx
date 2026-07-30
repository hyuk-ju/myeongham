import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CardsWorkspaceView, type CardsWorkspaceCard } from "@/app/(tabs)/cards/page";

const card: CardsWorkspaceCard = {
  id: "00000000-0000-4000-8000-000000000001", name: "홍길동", company: "샘플 제조", title: "구매팀", department: null,
  mobile: "010-0000-0000", mobile2: null, phone: null, email: "sample@example.test", capabilities: ["정밀가공"], is_current: true, created_at: "2026-01-01T00:00:00.000Z",
};

describe("CardsWorkspaceView", () => {
  it("renders a selected preview with safe contact actions", () => {
    render(<CardsWorkspaceView cards={[card]} total={1} hasMore={false} page={1} q="" filter="all" tag="" company="" topTags={[]} companyCounts={{ "샘플 제조": 1 }} />);
    expect(screen.getByText("Selected slip")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "홍길동 전화 걸기" })).toHaveAttribute("href", "tel:010-0000-0000");
    expect(screen.getByRole("link", { name: "홍길동 이메일 보내기" })).toHaveAttribute("href", "mailto:sample@example.test");
  });

  it("renders an actionable empty result state", () => {
    render(<CardsWorkspaceView cards={[]} total={0} hasMore={false} page={1} q="없는 회사" filter="all" tag="" company="" topTags={[]} companyCounts={{}} />);
    expect(screen.getByRole("heading", { name: "조건에 맞는 명함이 없습니다" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "필터 초기화" })).toHaveAttribute("href", "/cards");
  });
});
