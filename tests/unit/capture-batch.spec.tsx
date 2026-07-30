import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CaptureView } from "@/app/capture/capture-client";
import type { DraftQueueActions, DraftQueueSnapshot } from "@/lib/draft-queue-state";
import type { DraftRow } from "@/lib/drafts";

const draft = (status: DraftRow["status"], id = "draft-1"): DraftRow => ({
  id,
  image_path: `${id}.jpg`,
  image_url: "https://example.test/card.jpg",
  status,
  extracted: null,
  error: status === "failed" ? "provider_unconfigured" : null,
  attempts: 0,
  enrich: null,
  created_at: "2026-01-01T00:00:00.000Z",
});

function snapshot(overrides: Partial<DraftQueueSnapshot> = {}): DraftQueueSnapshot {
  return {
    drafts: [], uploads: [], uploading: 0, loading: false, analyzingId: null,
    enrichingCompany: null, errorCode: null, stopCode: null, ready: [], failed: [], waiting: [], processing: [],
    ...overrides,
  };
}

function actions(): DraftQueueActions {
  return {
    add: vi.fn().mockResolvedValue(undefined), retryUpload: vi.fn().mockResolvedValue(undefined), discardUpload: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined), retry: vi.fn().mockResolvedValue(undefined), retryFailed: vi.fn().mockResolvedValue(undefined),
    discard: vi.fn().mockResolvedValue(undefined), acknowledgeFinalized: vi.fn().mockResolvedValue(undefined),
  };
}

describe("capture batch view", () => {
  it("Given an empty queue When rendered Then the first action offers capture and album entry points", () => {
    render(<CaptureView connected snapshot={snapshot()} actions={actions()} />);
    expect(screen.getByRole("button", { name: /명함 촬영/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /앨범에서 선택/ })).toBeInTheDocument();
  });

  it("Given ready, processing, failed and uploading items When rendered Then each lifecycle state has an explicit action", () => {
    const queueActions = actions();
    const failedUpload = { localId: "local-1", previewUrl: "blob:test", status: "failed" as const, errorCode: "network_error" };
    const ready = draft("extracted", "ready");
    const failed = draft("failed", "failed");
    const processing = draft("processing", "processing");
    const waiting = draft("pending", "waiting");
    render(<CaptureView connected snapshot={snapshot({ drafts: [ready, failed, processing, waiting], uploads: [failedUpload], ready: [ready], failed: [failed], processing: [processing], waiting: [waiting] })} actions={queueActions} />);
    expect(screen.getByLabelText("완료 명함")).toBeInTheDocument();
    expect(screen.getByLabelText("실패 명함")).toBeInTheDocument();
    expect(screen.getByLabelText("읽는 중 명함")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "업로드 다시 시도" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "업로드 다시 시도" }));
    expect(queueActions.retryUpload).toHaveBeenCalledWith("local-1");
  });
});
