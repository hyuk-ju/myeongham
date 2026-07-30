// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  searchCompanyWithOpenAI,
  type CompanySearchRuntime,
} from "@/lib/ai/openai-company-search";

const RESPONSE_ID = "resp_contract_fixture";

function completedResponse(): Response {
  return Response.json({
    id: RESPONSE_ID,
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
          queries: ["OpenAI company"],
          sources: [
            { type: "url", url: "https://openai.com/about/" },
            { type: "url", url: "https://openai.com/about/" },
            { type: "url", url: "http://insecure.example/source" },
          ],
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
              industry: "인공지능 연구 및 제품 개발",
              capabilities: ["생성형 AI", "AI API"],
              summary: "인공지능 연구와 제품을 개발하는 기업입니다.",
              confident: true,
            }),
            annotations: [
              {
                type: "url_citation",
                start_index: 0,
                end_index: 1,
                url: "https://openai.com/about/",
                title: "  About OpenAI  ",
              },
              {
                type: "url_citation",
                start_index: 0,
                end_index: 1,
                url: "https://platform.openai.com/docs/",
                title: "API documentation",
              },
            ],
          },
        ],
      },
    ],
  });
}

describe("searchCompanyWithOpenAI", () => {
  it("uses the official Responses web-search contract when the provider completes", async () => {
    // Given
    let requestUrl = "";
    let authorization = "";
    let requestBody: unknown = null;
    const wireFetch: typeof fetch = async (input, init) => {
      requestUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const headers = new Headers(init?.headers);
      authorization = headers.get("authorization") ?? "";
      requestBody = JSON.parse(typeof init?.body === "string" ? init.body : "");
      return completedResponse();
    };
    const runtime: CompanySearchRuntime = {
      fetch: wireFetch,
      now: () => 0,
      sleep: async () => undefined,
    };

    // When
    const result = await searchCompanyWithOpenAI(
      {
        company: "OpenAI",
        companyEn: null,
        website: "https://openai.com",
        address: null,
        taxCode: null,
      },
      { apiKey: "contract-fixture-key", model: "gpt-5.6" },
      runtime,
    );

    // Then
    expect(new URL(requestUrl).pathname).toBe("/v1/responses");
    expect(authorization).toBe("Bearer contract-fixture-key");
    expect(requestBody).toMatchObject({
      model: "gpt-5.6",
      tools: [{ type: "web_search" }],
      tool_choice: "required",
      include: ["web_search_call.action.sources"],
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: "company_enrichment",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["industry", "capabilities", "summary", "confident"],
          },
        },
      },
    });
    expect(Object.keys(result.suggestion)).toEqual([
      "industry",
      "capabilities",
      "summary",
      "confident",
      "sources",
    ]);
    expect(result.suggestion).toEqual({
      industry: "인공지능 연구 및 제품 개발",
      capabilities: ["생성형 AI", "AI API"],
      summary: "인공지능 연구와 제품을 개발하는 기업입니다.",
      confident: true,
      sources: [
        { url: "https://openai.com/about/", title: "About OpenAI" },
        {
          url: "https://platform.openai.com/docs/",
          title: "API documentation",
        },
      ],
    });
    expect(result.searched).toBe(true);
    expect(result.responseId).toBe(RESPONSE_ID);
    expect(result.model).toBe("gpt-5.6");
  });
});
