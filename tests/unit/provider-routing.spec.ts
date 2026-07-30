import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/settings-store", () => ({
  getAISettings: vi.fn(),
}));
vi.mock("@/lib/ai/token-store", () => ({
  getValidToken: vi.fn(),
}));
vi.mock("@/lib/ai/codex", () => ({
  codexRequest: vi.fn(),
  codexWebSearch: vi.fn(),
  CODEX_MODEL: "gpt-5.6",
}));
vi.mock("@/lib/ai/claude", () => ({
  claudeRequest: vi.fn(),
  claudeWebSearch: vi.fn(),
  CLAUDE_MODEL: "claude-sonnet-5",
}));

import { callAI, webSearch } from "@/lib/ai/llm";
import { getAISettings } from "@/lib/ai/settings-store";
import { getValidToken } from "@/lib/ai/token-store";

const settings = {
  extract: { provider: null, model: null },
  ask: { provider: null, model: null },
  enrich: { provider: "openai-api" as const, model: null },
};
const supabase = createClient("https://fixture.supabase.co", "fixture-key");

describe("provider routing boundaries", () => {
  it("does not enter OAuth lookup for server-owned openai-api enrichment", async () => {
    vi.mocked(getAISettings).mockResolvedValue(settings);

    await expect(callAI(supabase, "owner_fixture", "enrich", "instructions", [])).rejects.toMatchObject({
      code: "provider_unconfigured",
      status: 503,
    });
    expect(getValidToken).not.toHaveBeenCalled();
  });

  it("does not route openai-api enrichment through private web search", async () => {
    vi.mocked(getAISettings).mockResolvedValue(settings);

    await expect(
      webSearch(supabase, "owner_fixture", "enrich", "instructions", "prompt"),
    ).rejects.toThrow("Responses adapter");
    expect(getValidToken).not.toHaveBeenCalled();
  });
});
