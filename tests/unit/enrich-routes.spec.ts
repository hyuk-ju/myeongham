import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({
  getAuthorizedUser: vi.fn(async () => ({
    user: { id: "user_fixture" },
    supabase: { rpc: vi.fn(async () => ({ data: 1, error: null })) },
  })),
}));
vi.mock("@/lib/ai/enrich", () => ({ enrichCompany: vi.fn() }));

import { POST as enrichPost } from "@/app/api/enrich/route";
import { POST as draftEnrichPost } from "@/app/api/drafts/enrich/route";
import { POST as settingsPost } from "@/app/api/ai/settings/route";
import { enrichCompany } from "@/lib/ai/enrich";
import { CompanySearchError } from "@/lib/ai/openai-company-search";
import { ProviderAuthError } from "@/lib/ai/provider-types";

const validBody = {
  company: "OpenAI",
  company_en: null,
  website: null,
  address: null,
  tax_code: null,
};

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/enrich", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function malformedRequest(): NextRequest {
  return new NextRequest("http://localhost/api/enrich", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("enrich route contracts", () => {
  beforeEach(() => {
    vi.mocked(enrichCompany).mockReset();
  });

  it.each([
    ["malformed JSON", malformedRequest()],
    ["unknown field", request({ ...validBody, extra: true })],
    ["missing company", request({ ...validBody, company: "" })],
    ["oversize company", request({ ...validBody, company: "x".repeat(501) })],
  ])("returns invalid_input/400 for %s on both routes", async (_name, input) => {
    const enrichResponse = await enrichPost(input);
    const draftResponse = await draftEnrichPost(input);

    expect(enrichResponse.status).toBe(400);
    expect(await json(enrichResponse)).toEqual({ code: "invalid_input", error: "invalid_input" });
    expect(draftResponse.status).toBe(400);
    expect(await json(draftResponse)).toEqual({ code: "invalid_input", error: "invalid_input" });
    expect(enrichCompany).not.toHaveBeenCalled();
  });

  it("maps Claude authentication expiry to a non-retryable stop", async () => {
    vi.mocked(enrichCompany).mockRejectedValue(new ProviderAuthError());

    const enrichResponse = await enrichPost(request(validBody));
    const draftResponse = await draftEnrichPost(request(validBody));
    const enrichBody = await json(enrichResponse);
    const draftBody = await json(draftResponse);

    expect(enrichResponse.status).toBe(401);
    expect(enrichBody).toEqual({ code: "auth_expired", error: "auth_expired", retryable: false });
    expect(draftResponse.status).toBe(401);
    expect(draftBody).toEqual({
      code: "auth_expired",
      error: "auth_expired",
      stopQueue: true,
      retryable: false,
    });
  });

  it.each([
    ["provider_unconfigured", 503, true],
    ["rate_limited", 429, true],
  ] as const)("maps %s without leaking provider details", async (code, status, stopQueue) => {
    vi.mocked(enrichCompany).mockRejectedValue(
      new CompanySearchError(code, status),
    );

    const enrichResponse = await enrichPost(request(validBody));
    const draftResponse = await draftEnrichPost(request(validBody));

    expect(enrichResponse.status).toBe(status);
    expect(await json(enrichResponse)).toEqual({ code, error: code });
    expect(draftResponse.status).toBe(status);
    expect(await json(draftResponse)).toEqual({ code, error: code, stopQueue });
  });

  it("maps unexpected provider failures to a secret-free upstream envelope", async () => {
    vi.mocked(enrichCompany).mockRejectedValue(new Error("secret upstream body"));

    const enrichResponse = await enrichPost(request(validBody));
    const draftResponse = await draftEnrichPost(request(validBody));
    const enrichBody = await json(enrichResponse);
    const draftBody = await json(draftResponse);

    expect(enrichResponse.status).toBe(502);
    expect(enrichBody).toEqual({ code: "upstream_failure", error: "upstream_failure" });
    expect(draftResponse.status).toBe(502);
    expect(draftBody).toEqual({
      code: "upstream_failure",
      error: "upstream_failure",
      stopQueue: false,
    });
    expect(JSON.stringify(enrichBody)).not.toContain("secret upstream body");
  });

  it("rejects a user-owned openai-api model in settings", async () => {
    const response = await settingsPost(
      request({
        extract: { provider: null, model: null },
        ask: { provider: null, model: null },
        enrich: { provider: "openai-api", model: "gpt-5.6" },
      }),
    );

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ code: "invalid_input", error: "invalid_input" });
  });
});
