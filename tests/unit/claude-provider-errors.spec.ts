import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

import { claudeWebSearch } from "@/lib/ai/claude";
import { refreshClaudeTokenSet } from "@/lib/ai/anthropic-oauth";
import { getValidToken } from "@/lib/ai/token-store";
import { ProviderAuthError } from "@/lib/ai/provider-types";

const token = {
  provider: "anthropic-claude" as const,
  access_token: "expired-access",
  refresh_token: "refresh-fixture",
  expires_at: "2020-01-01T00:00:00.000Z",
  chatgpt_account_id: null,
  refresh_started_at: null,
  owner_id: "owner_fixture",
  is_active: true,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Claude provider authentication errors", () => {
  it("maps expired token metadata plus refresh 401 to auth_expired without retry", async () => {
    let refreshCalls = 0;
    const wireFetch: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      if (url.includes("console.anthropic.com/v1/oauth/token")) {
        refreshCalls += 1;
        return new Response(JSON.stringify({ error: "expired_refresh" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/rest/v1/ai_tokens") && method === "GET") {
        return Response.json([token]);
      }
      if (url.includes("/rest/v1/ai_tokens") && method === "PATCH") {
        return url.includes("select=refresh_token")
          ? Response.json([{ refresh_token: "refresh-fixture" }])
          : Response.json([]);
      }
      throw new Error("unexpected fixture request");
    };
    vi.stubGlobal("fetch", wireFetch);
    const supabase = createClient("https://fixture.supabase.co", "fixture-key");

    const error = await getValidToken(supabase, "owner_fixture", "anthropic-claude").catch(
      (value: unknown) => value,
    );

    expect(error).toBeInstanceOf(ProviderAuthError);
    expect(error).toMatchObject({ code: "auth_expired", status: 401, retryable: false });
    expect(refreshCalls).toBe(1);
  });

  it("maps an upstream Claude 401 to auth_expired without a retry", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        return new Response(JSON.stringify({ error: "expired_access" }), { status: 401 });
      }),
    );

    const error = await claudeWebSearch(
      {
        provider: "anthropic-claude",
        accessToken: "masked-token",
        accountId: null,
      },
      "instructions",
      "prompt",
    ).catch((value: unknown) => value);

    expect(error).toBeInstanceOf(ProviderAuthError);
    expect(error).toMatchObject({ code: "auth_expired", status: 401, retryable: false });
    expect(calls).toBe(1);
  });

  it("preserves auth_expired for the direct refresh boundary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "expired_refresh" }), { status: 401 })),
    );

    await expect(refreshClaudeTokenSet("masked-refresh-token")).rejects.toMatchObject({
      code: "auth_expired",
      status: 401,
      retryable: false,
    });
  });
});
