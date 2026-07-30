import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getAuthorizedUser, extractCardFromImage } = vi.hoisted(() => ({
  getAuthorizedUser: vi.fn(),
  extractCardFromImage: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getAuthorizedUser }));
vi.mock("@/lib/ai/extract", () => ({ extractCardFromImage }));

import { POST } from "@/app/api/drafts/[id]/extract/route";

const id = "00000000-0000-0000-0000-000000000000";
const token = "00000000-0000-0000-0000-000000000001";
const row = {
  id,
  image_path: "owner/card.jpg",
  status: "extracted",
  extracted: null,
  error: null,
  attempts: 1,
  enrich: null,
  created_at: "2026-07-29T00:00:00.000Z",
};

afterEach(() => {
  vi.resetAllMocks();
});

describe("server-claimed extraction route", () => {
  it("Given an active owner claim When another extraction is processing Then busy is 409 and no draft or storage read occurs", async () => {
    const from = vi.fn();
    const supabase = {
      rpc: vi.fn(async () => ({ data: [{ code: "busy", status: "processing" }], error: null })),
      from,
      storage: {},
    };
    getAuthorizedUser.mockResolvedValue({ user: { id: "owner" }, supabase });

    const response = await POST(new Request("http://example.test"), { params: Promise.resolve({ id }) });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "busy", code: "busy" });
    expect(from).not.toHaveBeenCalled();
  });

  it("Given a claimed draft When extraction completes Then claim precedes storage and completion is token-fenced", async () => {
    const bytes = await readFile(resolve(process.cwd(), "tests/fixtures/cards/valid-jpeg.jpg"));
    const calls: string[] = [];
    const draftQuery = {
      select: vi.fn((value: string) => {
        calls.push(`select:${value}`);
        return draftQuery;
      }),
      eq: vi.fn(() => draftQuery),
      maybeSingle: vi
        .fn()
        .mockResolvedValueOnce({ data: { id, image_path: "owner/card.jpg" }, error: null })
        .mockResolvedValueOnce({ data: row, error: null }),
    };
    const supabase = {
      rpc: vi.fn(async (name: string) => {
        calls.push(`rpc:${name}`);
        if (name === "claim_card_draft") {
          return { data: [{ code: "claimed", processing_token: token, draft_id: id }], error: null };
        }
        return { data: [{ code: "completed", status: "extracted" }], error: null };
      }),
      from: vi.fn(() => draftQuery),
      storage: {
        from: vi.fn(() => ({
          download: vi.fn(async () => ({ data: { type: "image/jpeg", arrayBuffer: async () => bytes.buffer }, error: null })),
          createSignedUrls: vi.fn(async () => ({ data: [{ path: "owner/card.jpg", signedUrl: "https://example.test/card.jpg" }], error: null })),
        })),
      },
    };
    getAuthorizedUser.mockResolvedValue({ user: { id: "owner" }, supabase });
    extractCardFromImage.mockResolvedValue({ name: "Fixture" });

    const response = await POST(new Request("http://example.test"), { params: Promise.resolve({ id }) });

    expect(response.status).toBe(200);
    expect(calls[0]).toBe("rpc:claim_card_draft");
    expect(calls).toContain("rpc:complete_card_draft_extraction");
    expect(supabase.storage.from).toHaveBeenCalledTimes(2);
    expect(extractCardFromImage).toHaveBeenCalledTimes(1);
  });
});
