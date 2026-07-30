import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getAuthorizedUser } = vi.hoisted(() => ({ getAuthorizedUser: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuthorizedUser }));

import { POST } from "@/app/api/cards/route";

const owner = "owner-123";
const draftId = "00000000-0000-4000-8000-000000000001";
const cardId = "00000000-0000-4000-8000-000000000002";

afterEach(() => vi.resetAllMocks());

describe("atomic card finalization route", () => {
  it("Given a failed draft When saving edited fields Then only finalize_card_draft receives protected data", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ code: "finalized", card_id: cardId, created: true }],
      error: null,
    });
    const from = vi.fn();
    getAuthorizedUser.mockResolvedValue({ user: { id: owner }, supabase: { rpc, from } });

    const response = await POST(jsonRequest({
      draft_id: draftId,
      image_path: "forged/other.jpg",
      company: " Acme ",
      capabilities: [" CNC ", "CNC"],
      confidence: 0.7,
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: cardId, created: true });
    expect(rpc).toHaveBeenCalledWith("finalize_card_draft", {
      p_draft_id: draftId,
      p_card: expect.objectContaining({ company: "Acme", capabilities: ["CNC"] }),
      p_supersedes_id: null,
    });
    const payload = rpc.mock.calls[0]?.[1]?.p_card as Record<string, unknown>;
    expect(payload.owner_id).toBeUndefined();
    expect(payload.status).toBeUndefined();
    expect(payload.source_draft_id).toBeUndefined();
    expect(payload.supersedes_id).toBeUndefined();
    expect(from).not.toHaveBeenCalled();
  });

  it("Given owner or transition fields in a request When saving Then the strict parser rejects them", async () => {
    const rpc = vi.fn();
    getAuthorizedUser.mockResolvedValue({ user: { id: owner }, supabase: { rpc } });

    const response = await POST(jsonRequest({
      draft_id: draftId,
      owner_id: "attacker",
      status: "confirmed",
      source_draft_id: draftId,
      company: "Acme",
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_input" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("Given a missing or cross-owner superseded card When saving a normal card Then not_found is stable", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ code: "not_found", card_id: null }], error: null });
    getAuthorizedUser.mockResolvedValue({ user: { id: owner }, supabase: { rpc } });

    const response = await POST(jsonRequest({
      image_path: `${owner}/card.jpg`,
      name: "Person",
      supersedes_id: cardId,
    }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "not_found" });
    expect(rpc).toHaveBeenCalledWith("save_card", expect.objectContaining({ p_supersedes_id: cardId }));
  });

  it("Given a processing draft When finalization is attempted Then the route refuses to save", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ code: "busy", card_id: null }], error: null });
    getAuthorizedUser.mockResolvedValue({ user: { id: owner }, supabase: { rpc } });

    const response = await POST(jsonRequest({ draft_id: draftId, company: "Acme" }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "busy", code: "busy" });
  });

  it("Given a malformed draft id When saving Then no database mutation is attempted", async () => {
    const rpc = vi.fn();
    getAuthorizedUser.mockResolvedValue({ user: { id: owner }, supabase: { rpc } });

    const response = await POST(jsonRequest({ draft_id: "not-a-uuid", company: "Acme" }));

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});

function jsonRequest(value: Record<string, unknown>): NextRequest {
  return new NextRequest("http://example.test/api/cards", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
}
