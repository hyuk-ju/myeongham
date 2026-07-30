import { describe, expect, it, vi } from "vitest";
import { createDraftQueueTransport } from "@/lib/draft-queue-transport";

const row = {
  id: "00000000-0000-0000-0000-000000000000",
  image_path: "owner/card.jpg",
  status: "pending",
  extracted: null,
  error: null,
  attempts: 0,
  enrich: null,
  created_at: "2026-07-29T00:00:00.000Z",
  image_url: "https://example.test/card.jpg",
};

describe("draft queue transport", () => {
  it("Given a busy extraction response When transport extracts Then busy is preserved for refetch", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ error: "busy", code: "busy" }, { status: 409 }),
    );
    const result = await createDraftQueueTransport(fetcher).extract(row.id);

    expect(result).toEqual({ ok: false, code: "busy" });
  });

  it("Given a stale response with a late draft When transport extracts Then stale is not converted to failed", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ error: "stale_token", code: "stale_token", draft: row }, { status: 409 }),
    );
    const result = await createDraftQueueTransport(fetcher).extract(row.id);

    expect(result).toEqual({ ok: false, code: "stale_token", draft: row });
  });
});
