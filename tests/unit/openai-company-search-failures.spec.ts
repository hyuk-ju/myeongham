// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CompanySearchError,
  searchCompanyWithOpenAI,
  type CompanySearchRuntime,
} from "@/lib/ai/openai-company-search";

const VALID_INPUT = {
  company: "OpenAI",
  companyEn: null,
  website: null,
  address: null,
  taxCode: null,
} as const;

function providerResponse(overrides: Record<string, unknown> = {}): Response {
  return Response.json({
    id: "resp_failure_fixture",
    object: "response",
    status: "completed",
    incomplete_details: null,
    error: null,
    output: [
      {
        id: "ws_1",
        type: "web_search_call",
        status: "completed",
        action: {
          type: "search",
          sources: [{ type: "url", url: "https://openai.com/" }],
        },
      },
      {
        id: "msg_1",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              industry: null,
              capabilities: [],
              summary: null,
              confident: false,
            }),
            annotations: [
              {
                type: "url_citation",
                start_index: 0,
                end_index: 1,
                url: "https://openai.com/",
                title: "OpenAI",
              },
            ],
          },
        ],
      },
    ],
    ...overrides,
  });
}

function responseWithPayload(
  payload: unknown,
  sources: readonly { url: string; title: string }[],
): Response {
  return providerResponse({
    output: [
      {
        id: "ws_payload",
        type: "web_search_call",
        status: "completed",
        action: { type: "search", sources },
      },
      {
        id: "msg_payload",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [
          {
            type: "output_text",
            text: typeof payload === "string" ? payload : JSON.stringify(payload),
            annotations: sources.map((source, index) => ({
              type: "url_citation",
              start_index: index,
              end_index: index + 1,
              url: source.url,
              title: source.title,
            })),
          },
        ],
      },
    ],
  });
}

async function captureError(
  fetchImpl: typeof fetch,
  runtimeOverrides: Partial<CompanySearchRuntime> = {},
): Promise<CompanySearchError> {
  try {
    await searchCompanyWithOpenAI(
      VALID_INPUT,
      { apiKey: "contract-fixture-key", model: "gpt-5.6" },
      {
        fetch: fetchImpl,
        now: () => 0,
        sleep: async () => undefined,
        ...runtimeOverrides,
      },
    );
  } catch (error) {
    if (error instanceof CompanySearchError) return error;
    throw error;
  }
  throw new TypeError("Expected company search to fail");
}

describe("searchCompanyWithOpenAI failures", () => {
  it.each([
    ["missing API key", { apiKey: null, model: "gpt-5.6" }],
    ["disallowed server model", { apiKey: "fixture", model: "gpt-5.5" }],
  ])("fails closed as provider_unconfigured for %s", async (_name, config) => {
    // Given
    let attempts = 0;

    // When
    let actual: CompanySearchError | null = null;
    try {
      await searchCompanyWithOpenAI(VALID_INPUT, config, {
        fetch: async () => {
          attempts += 1;
          return providerResponse();
        },
        now: () => 0,
        sleep: async () => undefined,
      });
    } catch (error) {
      if (error instanceof CompanySearchError) actual = error;
      else throw error;
    }

    // Then
    expect(actual?.code).toBe("provider_unconfigured");
    expect(actual?.status).toBe(503);
    expect(attempts).toBe(0);
  });

  it.each([
    [400, "upstream_failure", 502],
    [401, "provider_unconfigured", 503],
    [403, "provider_unconfigured", 503],
    [404, "upstream_failure", 502],
    [409, "upstream_failure", 502],
    [422, "upstream_failure", 502],
  ])("maps HTTP %i without retry", async (status, code, routeStatus) => {
    // Given
    let attempts = 0;
    const wireFetch: typeof fetch = async () => {
      attempts += 1;
      return Response.json({ error: { message: "secret upstream body" } }, { status });
    };

    // When
    const error = await captureError(wireFetch);

    // Then
    expect(error.code).toBe(code);
    expect(error.status).toBe(routeStatus);
    expect(error.message).not.toContain("secret upstream body");
    expect(attempts).toBe(1);
  });

  it("uses clamped integer Retry-After seconds for 429 and caps total attempts", async () => {
    // Given
    let attempts = 0;
    let elapsed = 0;
    const delays: number[] = [];
    const wireFetch: typeof fetch = async () => {
      attempts += 1;
      return Response.json(
        { error: { message: "rate limit fixture" } },
        { status: 429, headers: { "Retry-After": "9" } },
      );
    };

    // When
    const error = await captureError(wireFetch, {
      now: () => elapsed,
      sleep: async (delay) => {
        delays.push(delay);
        elapsed += delay;
      },
    });

    // Then
    expect(error.code).toBe("rate_limited");
    expect(error.status).toBe(429);
    expect(attempts).toBe(3);
    expect(delays).toEqual([5_000, 5_000]);
  });

  it.each(["1.5", "-1", "Wed, 21 Oct 2015 07:28:00 GMT", "999999999999999999999"])(
    "uses default backoff for invalid Retry-After %s",
    async (retryAfter) => {
      // Given
      let attempts = 0;
      let elapsed = 0;
      const delays: number[] = [];
      const wireFetch: typeof fetch = async () => {
        attempts += 1;
        if (attempts < 3) {
          return Response.json(
            { error: { message: "rate limit fixture" } },
            { status: 429, headers: { "Retry-After": retryAfter } },
          );
        }
        return providerResponse();
      };

      // When
      await searchCompanyWithOpenAI(
        VALID_INPUT,
        { apiKey: "fixture", model: "gpt-5.6" },
        {
          fetch: wireFetch,
          now: () => elapsed,
          sleep: async (delay) => {
            delays.push(delay);
            elapsed += delay;
          },
        },
      );

      // Then
      expect(delays).toEqual([500, 1_000]);
    },
  );

  it("uses default backoff for 5xx and ignores Retry-After", async () => {
    // Given
    let attempts = 0;
    let elapsed = 0;
    const delays: number[] = [];
    const wireFetch: typeof fetch = async () => {
      attempts += 1;
      return Response.json(
        { error: { message: "upstream fixture" } },
        { status: 503, headers: { "Retry-After": "4" } },
      );
    };

    // When
    const error = await captureError(wireFetch, {
      now: () => elapsed,
      sleep: async (delay) => {
        delays.push(delay);
        elapsed += delay;
      },
    });

    // Then
    expect(error.code).toBe("upstream_failure");
    expect(error.status).toBe(502);
    expect(attempts).toBe(3);
    expect(delays).toEqual([500, 1_000]);
  });

  it("does not start another attempt when the deadline reserve is exhausted", async () => {
    // Given
    let attempts = 0;
    let clockReads = 0;
    const wireFetch: typeof fetch = async () => {
      attempts += 1;
      return Response.json({ error: { message: "rate limit" } }, { status: 429 });
    };

    // When
    const error = await captureError(wireFetch, {
      now: () => {
        clockReads += 1;
        return clockReads === 1 ? 0 : 58_500;
      },
    });

    // Then
    expect(error.code).toBe("rate_limited");
    expect(error.status).toBe(429);
    expect(attempts).toBe(1);
  });

  it("maps a transport error once without retry", async () => {
    // Given
    let attempts = 0;
    const wireFetch: typeof fetch = async () => {
      attempts += 1;
      throw new TypeError("offline fixture");
    };

    // When
    const error = await captureError(wireFetch);

    // Then
    expect(error.code).toBe("upstream_failure");
    expect(error.status).toBe(502);
    expect(attempts).toBe(1);
  });

  it("maps an unwrapped transport error without leaking its message", async () => {
    let attempts = 0;
    const wireFetch: typeof fetch = async () => {
      attempts += 1;
      throw new Error("private transport detail");
    };

    const error = await captureError(wireFetch);

    expect(error.code).toBe("upstream_failure");
    expect(error.status).toBe(502);
    expect(error.message).not.toContain("private transport detail");
    expect(attempts).toBe(1);
  });

  it.each([
    ["incomplete response", { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }],
    ["provider error", { error: { code: "server_error", message: "fixture" } }],
    ["no completed search", { output: [] }],
    [
      "completed search without sources",
      {
        output: [
          {
            id: "ws_open_page",
            type: "web_search_call",
            status: "completed",
            action: { type: "open_page", url: "https://openai.com/" },
          },
        ],
      },
    ],
  ])("rejects %s as invalid_provider_response", async (_name, override) => {
    // Given
    const wireFetch: typeof fetch = async () => providerResponse(override);

    // When
    const error = await captureError(wireFetch);

    // Then
    expect(error.code).toBe("invalid_provider_response");
    expect(error.status).toBe(502);
  });

  it.each([
    ["malformed output JSON", "not-json"],
    [
      "industry above 500 characters",
      {
        industry: "x".repeat(501),
        capabilities: [],
        summary: null,
        confident: false,
      },
    ],
    [
      "capabilities above 12 items",
      {
        industry: null,
        capabilities: Array.from({ length: 13 }, (_, index) => `capability-${index}`),
        summary: null,
        confident: false,
      },
    ],
    [
      "capability item above 80 characters",
      {
        industry: null,
        capabilities: ["x".repeat(81)],
        summary: null,
        confident: false,
      },
    ],
    [
      "summary above 500 characters",
      {
        industry: null,
        capabilities: [],
        summary: "x".repeat(501),
        confident: false,
      },
    ],
  ])("rejects %s", async (_name, payload) => {
    const wireFetch: typeof fetch = async () =>
      responseWithPayload(payload, [{ url: "https://source.example/", title: "Source" }]);

    const error = await captureError(wireFetch);

    expect(error.code).toBe("invalid_provider_response");
    expect(error.status).toBe(502);
  });

  it.each([
    ["zero sources", []],
    ["only non-HTTPS sources", [{ url: "http://source.example/", title: "Source" }]],
  ])("rejects %s", async (_name, sources) => {
    const wireFetch: typeof fetch = async () =>
      responseWithPayload(
        { industry: null, capabilities: [], summary: null, confident: false },
        sources,
      );

    const error = await captureError(wireFetch);

    expect(error.code).toBe("invalid_provider_response");
    expect(error.status).toBe(502);
  });

  it("deduplicates repeated HTTPS sources before returning them", async () => {
    const wireFetch: typeof fetch = async () =>
      responseWithPayload(
        { industry: null, capabilities: [], summary: null, confident: false },
        [
          { url: "https://source.example/#one", title: "Source" },
          { url: "https://source.example/#two", title: "Source" },
        ],
      );

    const result = await searchCompanyWithOpenAI(
      VALID_INPUT,
      { apiKey: "contract-fixture-key", model: "gpt-5.6" },
      { fetch: wireFetch, now: () => 0, sleep: async () => undefined },
    );

    expect(result.suggestion.sources).toEqual([
      { url: "https://source.example/", title: "Source" },
    ]);
  });

  it("rejects a completed refusal even when search and sources exist", async () => {
    const wireFetch: typeof fetch = async () =>
      providerResponse({
        output: [
          {
            id: "ws_refusal",
            type: "web_search_call",
            status: "completed",
            action: {
              type: "search",
              sources: [{ type: "url", url: "https://source.example/" }],
            },
          },
          {
            id: "msg_refusal",
            type: "message",
            role: "assistant",
            status: "completed",
            content: [{ type: "refusal", refusal: "private refusal fixture" }],
          },
        ],
      });

    const error = await captureError(wireFetch);

    expect(error.code).toBe("invalid_provider_response");
    expect(error.status).toBe(502);
    expect(error.message).not.toContain("private refusal fixture");
  });
});
