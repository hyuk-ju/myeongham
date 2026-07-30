import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({
  getAuthorizedUser: vi.fn(async () => ({
    user: { id: "owner_fixture" },
    supabase: {},
  })),
}));
vi.mock("@/lib/ai/settings-store", () => ({
  getAISettings: vi.fn(),
  saveAISettings: vi.fn(async () => undefined),
}));
vi.mock("@/lib/ai/token-store", () => ({
  getValidToken: vi.fn(),
}));
vi.mock("@/lib/ai/codex", () => ({
  codexRequest: vi.fn(),
  codexWebSearch: vi.fn(),
  CODEX_MODEL: "gpt-5.5",
}));
vi.mock("@/lib/ai/claude", () => ({
  claudeRequest: vi.fn(),
  claudeWebSearch: vi.fn(),
  CLAUDE_MODEL: "claude-sonnet-5",
}));

import { POST as settingsPost } from "@/app/api/ai/settings/route";
import { webSearch } from "@/lib/ai/llm";
import { codexWebSearch } from "@/lib/ai/codex";
import { getAISettings, saveAISettings } from "@/lib/ai/settings-store";
import { getValidToken } from "@/lib/ai/token-store";

const supabase = createClient("https://fixture.supabase.co", "fixture-key");
const oauthSettings = {
  extract: { provider: null, model: null },
  ask: { provider: null, model: null },
  enrich: { provider: "openai-codex" as const, model: "gpt-5.5" },
};

describe("experimental OAuth company search restoration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("routes explicit ChatGPT OAuth enrichment through Codex web search", async () => {
    vi.mocked(getAISettings).mockResolvedValue(oauthSettings);
    vi.mocked(getValidToken).mockResolvedValue({
      provider: "openai-codex",
      accessToken: "synthetic-token",
      accountId: "synthetic-account",
    });
    vi.mocked(codexWebSearch).mockResolvedValue({
      text: "{}",
      sources: ["https://example.invalid/source"],
      searched: true,
      searchError: null,
    });

    const result = await webSearch(supabase, "owner_fixture", "enrich", "instructions", "prompt");

    expect(getValidToken).toHaveBeenCalledWith(supabase, "owner_fixture", "openai-codex");
    expect(codexWebSearch).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "openai-codex" }),
      "instructions",
      "prompt",
      "gpt-5.5",
    );
    expect(result.provider).toBe("openai-codex");
  });

  it("accepts an explicit experimental OAuth provider for company search settings", async () => {
    const response = await settingsPost(new NextRequest("http://localhost/api/ai/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(oauthSettings),
    }));

    expect(response.status).toBe(200);
    expect(saveAISettings).toHaveBeenCalledWith(
      expect.anything(),
      "owner_fixture",
      expect.objectContaining({ enrich: { provider: "openai-codex", model: "gpt-5.5" } }),
    );
  });
});
