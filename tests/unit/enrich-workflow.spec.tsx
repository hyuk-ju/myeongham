import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EnrichPanel, type EnrichSuggestion } from "@/components/enrich-panel";
import { EnrichView, type EnrichViewRow } from "@/app/(tabs)/enrich/enrich-view";

const suggestion: EnrichSuggestion = {
  industry: "정밀 제조",
  capabilities: ["CNC", "AOI"],
  summary: "공식 홈페이지에서 확인한 제조 회사입니다.",
  confident: true,
  sources: [{ url: "https://example.com/company", title: "공식 홈페이지" }],
};

function row(status: EnrichViewRow["status"]): EnrichViewRow {
  return { company: "예시 회사", missing: 2, total: 3, status, suggestion: status === "waiting" ? null : suggestion, picked: [], error: null, updated: 0 };
}

describe("enrichment workflow view", () => {
  it("shows n/total progress, source provenance, filters, and retry-failed-only", () => {
    const onRetryFailed = vi.fn();
    render(
      <EnrichView
        rows={[row("waiting"), { ...row("failed"), company: "실패 회사", error: "rate_limited" }]}
        running={false}
        stoppedCode="rate_limited"
        filter="all"
        onFilterChange={vi.fn()}
        onStart={vi.fn()}
        onStop={vi.fn()}
        onRetryFailed={onRetryFailed}
        onToggle={vi.fn()}
        onApply={vi.fn()}
      />,
    );

    expect(screen.getByText("1/2 처리됨")).toBeVisible();
    expect(screen.getByText("1개 출처 확인")).toBeVisible();
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent("사용량 제한");
    expect(screen.getAllByText("실패", { exact: true }).find((element) => element.tagName === "SPAN")).toHaveClass("whitespace-nowrap");
    fireEvent.click(screen.getByRole("button", { name: /실패한 1개만 재시도/ }));
    expect(onRetryFailed).toHaveBeenCalledOnce();
  });

  it("does not silently apply confident tags after search", async () => {
    const onApply = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => suggestion }));
    render(
      <EnrichPanel
        subject={{ company: "예시 회사", company_en: null, website: null, address: null, tax_code: null }}
        currentIndustry={null}
        currentCapabilities={[]}
        onApply={onApply}
      />,
    );

    const searchButton = screen.getByRole("button", { name: "검색" });
    expect(searchButton).toHaveClass("ui-action");
    fireEvent.click(searchButton);
    expect(await screen.findByRole("link", { name: "공식 홈페이지" })).toHaveAttribute("href", "https://example.com/company");
    expect(screen.getByRole("button", { name: "+ CNC" })).toHaveClass("min-h-11");
    expect(screen.getByText("출처 1건 보기")).toBeVisible();
    expect(onApply).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
