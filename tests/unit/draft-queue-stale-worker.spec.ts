import { describe, expect, it, vi } from "vitest";
import { createDraftQueueTransport } from "@/lib/draft-queue-transport";

const id = "00000000-0000-0000-0000-000000000000";
const draft = {
  id,
  image_path: "owner/card.jpg",
  status: "processing",
  extracted: null,
  error: null,
  attempts: 2,
  enrich: null,
  created_at: "2026-07-29T00:00:00.000Z",
  image_url: "https://example.test/card.jpg",
};

describe("late extraction worker fencing", () => {
  it("Given a rotated claim When a late completion arrives Then the stale token is refetched and never failed", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ code: "stale_token", error: "stale_token", draft }, { status: 409 }),
    );
    const result = await createDraftQueueTransport(fetcher).extract(id);

    expect(result).toEqual({ ok: false, code: "stale_token", draft });
    expect(result.ok ? null : result.code).toBe("stale_token");
    expect(result.ok ? null : result.draft?.status).toBe("processing");
  });
});
