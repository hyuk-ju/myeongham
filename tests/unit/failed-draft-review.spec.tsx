import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CardReview } from "@/components/card-review";
import { EMPTY_DRAFT, type CardDraft } from "@/app/capture/card-form";

vi.mock("@/app/capture/card-form", () => ({
  CardForm: ({ draft, onChange }: { draft: CardDraft; onChange: (next: CardDraft) => void }) => (
    <input
      aria-label="회사"
      value={draft.company ?? ""}
      onChange={(event) => onChange({ ...draft, company: event.target.value || null })}
    />
  ),
  EMPTY_DRAFT: {
    name: null, name_en: null, title: null, department: null, company: null, company_en: null,
    phone: null, mobile: null, mobile2: null, fax: null, email: null, email2: null, website: null,
    address: null, postal_code: null, tax_code: null, raw_text: null, industry: null,
    capabilities: [], confidence: 0, notes: null, met_at: null, met_context: null,
  },
}));
vi.mock("@/app/capture/duplicate-review", () => ({ DuplicateReview: () => null }));
vi.mock("@/components/company-tags-panel", () => ({ CompanyTagsPanel: () => null }));
vi.mock("@/components/enrich-panel", () => ({ EnrichPanel: () => null }));

afterEach(() => vi.restoreAllMocks());

const draft = { ...EMPTY_DRAFT, company: "초기 회사" };

describe("failed draft review", () => {
  it("Given a failed draft When rendered Then the original image, error, retry and editable form remain visible", () => {
    const onRetry = vi.fn();
    renderReview({ draftStatus: "failed", draftError: "읽기 실패", onRetry });

    expect(screen.getByRole("img", { name: "명함" })).toHaveAttribute("src", "https://example.test/card.jpg");
    expect(screen.getByRole("alert")).toHaveTextContent("읽기 실패");
    expect(screen.getByRole("button", { name: "AI 다시 시도" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("초기 회사")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "AI 다시 시도" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("Given unsaved edits When the save response is ambiguous Then the form and an error remain", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    renderReview({ draftStatus: "failed", draftError: "읽기 실패", onRetry: vi.fn() });
    fireEvent.change(screen.getByLabelText("회사"), { target: { value: "수정한 회사" } });
    fireEvent.click(screen.getByRole("button", { name: "저장하고 다음 장" }));

    await waitFor(() => expect(screen.getAllByRole("alert")[0]).toHaveTextContent("저장 여부를 확인하지 못했습니다"));
    expect(screen.getByDisplayValue("수정한 회사")).toBeInTheDocument();
  });
});

function renderReview(overrides: {
  readonly draftStatus: "failed" | "extracted";
  readonly draftError: string;
  readonly onRetry: () => void;
}) {
  function Harness() {
    const [value, setValue] = useState<CardDraft>(draft);
    return (
      <CardReview
        imagePath="owner/card.jpg"
        imageUrl="https://example.test/card.jpg"
        draft={value}
        onChange={setValue}
        knownTags={[]}
        onSaved={vi.fn()}
        onDiscard={vi.fn()}
        {...overrides}
      />
    );
  }
  return render(<Harness />);
}
