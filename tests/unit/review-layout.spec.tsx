import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReviewView } from "@/app/capture/review/review-client";
import type { DraftQueueActions, DraftQueueSnapshot } from "@/lib/draft-queue-state";
import type { DraftRow } from "@/lib/drafts";

vi.mock("@/components/enrich-panel", () => ({ EnrichPanel: () => <div data-testid="enrich-panel" /> }));
vi.mock("@/components/company-tags-panel", () => ({ CompanyTagsPanel: () => <div data-testid="company-tags" /> }));

const baseDraft: DraftRow = {
  id: "00000000-0000-4000-8000-000000000001", image_path: "card.jpg", image_url: "https://example.test/card.jpg",
  status: "extracted", extracted: { company: "Acme", name: "Person", title: null, department: null, mobile: null, phone: null, email: null, website: null, address: null, industry: null, capabilities: [], confidence: 0.9, name_en: null, company_en: null, mobile2: null, fax: null, email2: null, postal_code: null, tax_code: null, raw_text: null },
  error: null, attempts: 0, enrich: null, created_at: "2026-01-01T00:00:00.000Z",
};

function snapshot(overrides: Partial<DraftQueueSnapshot> = {}): DraftQueueSnapshot {
  return { drafts: [], uploads: [], uploading: 0, loading: false, analyzingId: null, enrichingCompany: null, errorCode: null, stopCode: null, ready: [], failed: [], waiting: [], processing: [], ...overrides };
}

const actions: DraftQueueActions = {
  add: vi.fn().mockResolvedValue(undefined), retryUpload: vi.fn().mockResolvedValue(undefined), discardUpload: vi.fn(), refresh: vi.fn().mockResolvedValue(undefined), retry: vi.fn().mockResolvedValue(undefined), retryFailed: vi.fn().mockResolvedValue(undefined), discard: vi.fn().mockResolvedValue(undefined), acknowledgeFinalized: vi.fn().mockResolvedValue(undefined),
};

describe("review layout view", () => {
  it("Given a loading queue When rendered Then progress is announced", () => {
    render(<ReviewView snapshot={snapshot({ loading: true })} actions={actions} knownTags={[]} />);
    expect(screen.getByRole("status")).toHaveTextContent("대기열을 불러오는 중");
  });

  it("Given an extracted draft When rendered Then original image and grouped verification form are visible", () => {
    render(<ReviewView snapshot={snapshot({ drafts: [baseDraft], ready: [baseDraft] })} actions={actions} knownTags={[]} />);
    expect(screen.getByRole("img", { name: "명함" })).toHaveAttribute("src", "https://example.test/card.jpg");
    expect(screen.getByRole("heading", { name: "필수 확인" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "추가 정보" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "저장하고 다음 장" })).toBeInTheDocument();
  });
});
