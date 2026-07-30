import { afterEach, describe, expect, it, vi } from "vitest";
import { codexRequest } from "@/lib/ai/codex";
import type { ActiveToken } from "@/lib/ai/token-store";

const TOKEN: ActiveToken = {
  provider: "openai-codex",
  accessToken: "synthetic-access-token",
  accountId: null,
};

describe("current AI adapter seam", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Given a synthetic SSE response When the adapter reads it Then deltas are joined", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          [
            'data: {"type":"response.output_text.delta","delta":"synthetic "}',
            'data: {"type":"response.output_text.delta","delta":"result"}',
            "data: [DONE]",
          ].join("\n"),
          { status: 200 },
        ),
      ),
    );

    await expect(
      codexRequest(TOKEN, "fixture instructions", [{ type: "input_text", text: "fixture" }]),
    ).resolves.toBe("synthetic result");
  });

  it("Given a rate-limit response When the adapter reads it Then the stable Korean envelope is used", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("fixture", { status: 429 })));

    await expect(
      codexRequest(TOKEN, "fixture instructions", [{ type: "input_text", text: "fixture" }]),
    ).rejects.toThrow("구독 사용량 한도에 도달했습니다.");
  });
});
