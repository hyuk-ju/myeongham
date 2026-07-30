import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomeView } from "@/app/(tabs)/page";

describe("HomeView next action", () => {
  it("prioritizes failed drafts before review and enrichment work", () => {
    render(<HomeView total={4} untagged={2} aiAvailable={false} drafts={{ pending: 1, processing: 0, failed: 1, extracted: 2 }} recent={[]} />);
    expect(screen.getByText("실패한 분석 1장")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "복구 시작" })).toHaveAttribute("href", "/capture/review");
  });

  it("shows a clear success state when no work remains", () => {
    render(<HomeView total={0} untagged={0} aiAvailable={true} drafts={{ pending: 0, processing: 0, failed: 0, extracted: 0 }} recent={[]} />);
    expect(screen.getByRole("heading", { name: "오늘은 모두 정리됐어요" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "첫 명함 등록" })).toHaveAttribute("href", "/capture");
  });
});
