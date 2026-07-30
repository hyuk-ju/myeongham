import { describe, expect, it } from "vitest";
import {
  initialDraftQueueState,
  reduceDraftQueue,
  selectDraftQueueSnapshot,
} from "@/lib/draft-queue-state";
import type { DraftRow } from "@/lib/drafts";

const draft = (id: string, status: DraftRow["status"]): DraftRow => ({
  id,
  image_path: `owner/${id}.jpg`,
  status,
  extracted: null,
  error: null,
  attempts: 0,
  enrich: null,
  created_at: "2026-07-29T00:00:00.000Z",
  image_url: `https://example.test/${id}.jpg`,
});

describe("draft queue state contract", () => {
  it("Given two uploads When one succeeds and one fails Then each lifecycle remains independent", () => {
    const started = reduceDraftQueue(initialDraftQueueState, {
      type: "upload_started",
      upload: { localId: "a", previewUrl: "blob:a", status: "uploading", errorCode: null },
    });
    const both = reduceDraftQueue(started, {
      type: "upload_started",
      upload: { localId: "b", previewUrl: "blob:b", status: "uploading", errorCode: null },
    });
    const succeeded = reduceDraftQueue(both, {
      type: "upload_succeeded",
      localId: "a",
      draft: draft("server-a", "pending"),
    });
    const failed = reduceDraftQueue(succeeded, { type: "upload_failed", localId: "b", code: "network_error" });
    const snapshot = selectDraftQueueSnapshot(failed);

    expect(snapshot.uploads).toEqual([
      { localId: "b", previewUrl: "blob:b", status: "failed", errorCode: "network_error" },
    ]);
    expect(snapshot.drafts.map((row) => row.id)).toEqual(["server-a"]);
    expect(snapshot.uploading).toBe(0);
  });

  it("Given a mixed server list When selecting the snapshot Then every status selector is exhaustive", () => {
    const state = reduceDraftQueue(initialDraftQueueState, {
      type: "loaded",
      drafts: [draft("ready", "extracted"), draft("failed", "failed"), draft("waiting", "pending"), draft("busy", "processing")],
    });
    const snapshot = selectDraftQueueSnapshot(state);

    expect(snapshot.ready.map((row) => row.id)).toEqual(["ready"]);
    expect(snapshot.failed.map((row) => row.id)).toEqual(["failed"]);
    expect(snapshot.waiting.map((row) => row.id)).toEqual(["waiting"]);
    expect(snapshot.processing.map((row) => row.id)).toEqual(["busy"]);
  });

  it("Given a stale worker result When the queue reconciles Then stale state does not become failed", () => {
    const state = reduceDraftQueue(initialDraftQueueState, {
      type: "loaded",
      drafts: [draft("same", "pending")],
    });
    const refreshed = reduceDraftQueue(state, { type: "loaded", drafts: [draft("same", "processing")] });

    expect(selectDraftQueueSnapshot(refreshed).failed).toHaveLength(0);
    expect(selectDraftQueueSnapshot(refreshed).processing[0]?.id).toBe("same");
  });
});
