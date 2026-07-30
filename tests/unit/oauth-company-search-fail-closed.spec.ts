import { afterEach, describe, expect, it, vi } from "vitest";
import { codexWebSearch } from "@/lib/ai/codex";
import { CompanySearchError } from "@/lib/ai/openai-company-search-contract";
import { ProviderAuthError } from "@/lib/ai/provider-types";

const token = {
  provider: "openai-codex" as const,
  accessToken: "synthetic-token",
  accountId: "synthetic-account",
};

afterEach(() => vi.unstubAllGlobals());

describe("experimental Codex company search fail-closed boundary", () => {
  it("maps authentication and rate limits to stable secret-free errors", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response("private auth body", { status: 401 }))
      .mockResolvedValueOnce(new Response("private rate body", { status: 429 })));

    await expect(codexWebSearch(token, "instructions", "prompt")).rejects.toBeInstanceOf(ProviderAuthError);
    await expect(codexWebSearch(token, "instructions", "prompt")).rejects.toMatchObject({
      code: "rate_limited",
      status: 429,
    });
  });

  it("does not leak unofficial backend response bodies", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("secret upstream response", { status: 500 })));

    const error = await codexWebSearch(token, "instructions", "prompt").catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(CompanySearchError);
    expect(error).toMatchObject({ code: "invalid_provider_response", status: 502 });
    expect(String(error)).not.toContain("secret upstream response");
  });

  it("rejects a completed-looking stream without usable output", async () => {
    const stream = [
      'data: {"type":"response.web_search_call.completed"}',
      "data: [DONE]",
      "",
    ].join("\n");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(stream, { status: 200 })));

    await expect(codexWebSearch(token, "instructions", "prompt")).rejects.toMatchObject({
      code: "invalid_provider_response",
      status: 502,
    });
  });
});
