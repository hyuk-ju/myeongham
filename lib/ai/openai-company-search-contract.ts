import { z } from "zod";
import type { Response as OpenAIResponse } from "openai/resources/responses/responses";

export const COMPANY_SEARCH_ERROR_CODES = [
  "invalid_input",
  "provider_unconfigured",
  "rate_limited",
  "upstream_failure",
  "invalid_provider_response",
] as const;

export type CompanySearchErrorCode = (typeof COMPANY_SEARCH_ERROR_CODES)[number];

export class CompanySearchError extends Error {
  readonly code: CompanySearchErrorCode;
  readonly status: number;

  constructor(code: CompanySearchErrorCode, status: number) {
    super(code);
    this.name = "CompanySearchError";
    this.code = code;
    this.status = status;
  }
}

export interface EnrichSource {
  readonly url: string;
  readonly title: string;
}

export interface OpenAIEnrichSuggestion {
  readonly industry: string | null;
  readonly capabilities: readonly string[];
  readonly summary: string | null;
  readonly confident: boolean;
  readonly sources: readonly EnrichSource[];
}

const OPTIONAL_HINT_SCHEMA = z.string().trim().max(500).nullable().optional();

export const COMPANY_SEARCH_INPUT_SCHEMA = z
  .object({
    company: z.string().trim().min(1).max(500),
    company_en: OPTIONAL_HINT_SCHEMA,
    website: OPTIONAL_HINT_SCHEMA,
    address: OPTIONAL_HINT_SCHEMA,
    tax_code: OPTIONAL_HINT_SCHEMA,
  })
  .strict();

export const COMPANY_SEARCH_ARGUMENT_SCHEMA = z
  .object({
    company: z.string().trim().min(1).max(500),
    companyEn: OPTIONAL_HINT_SCHEMA,
    website: OPTIONAL_HINT_SCHEMA,
    address: OPTIONAL_HINT_SCHEMA,
    taxCode: OPTIONAL_HINT_SCHEMA,
  })
  .strict();

export interface CompanySearchResult {
  readonly suggestion: OpenAIEnrichSuggestion;
  readonly searched: true;
  readonly responseId: string;
  readonly model: "gpt-5.6";
}

export const STRUCTURED_FORMAT = {
  type: "json_schema",
  name: "company_enrichment",
  strict: true,
  schema: {
    type: "object",
    properties: {
      industry: { type: ["string", "null"] },
      capabilities: { type: "array", items: { type: "string" } },
      summary: { type: ["string", "null"] },
      confident: { type: "boolean" },
    },
    required: ["industry", "capabilities", "summary", "confident"],
    additionalProperties: false,
  },
} as const;

const RESPONSE_SCHEMA = z
  .object({
    industry: z.string().trim().min(1).max(500).nullable(),
    capabilities: z.array(z.string().trim().min(1).max(80)).max(12),
    summary: z.string().trim().min(1).max(500).nullable(),
    confident: z.boolean(),
  })
  .strict();

function normalizeUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function sourceList(response: OpenAIResponse): EnrichSource[] {
  const eventUrls: string[] = [];
  const citations = new Map<string, string>();

  for (const item of response.output) {
    if (item.type === "web_search_call" && item.status === "completed") {
      if (item.action.type === "search") {
        for (const source of item.action.sources ?? []) eventUrls.push(source.url);
      }
    }
    if (item.type !== "message") continue;
    for (const content of item.content) {
      if (content.type !== "output_text") continue;
      for (const annotation of content.annotations) {
        if (annotation.type !== "url_citation") continue;
        const normalized = normalizeUrl(annotation.url);
        if (normalized) {
          citations.set(normalized, annotation.title.trim().slice(0, 200));
          eventUrls.push(annotation.url);
        }
      }
    }
  }

  const seen = new Set<string>();
  const sources: EnrichSource[] = [];
  for (const raw of eventUrls) {
    const url = normalizeUrl(raw);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const title = citations.get(url) || new URL(url).hostname;
    sources.push({ url, title: title.slice(0, 200) });
    if (sources.length === 10) break;
  }
  return sources;
}

export function parseOpenAICompanyResponse(response: OpenAIResponse): CompanySearchResult {
  const completedSearches = response.output.filter(
    (item) =>
      item.type === "web_search_call" &&
      item.status === "completed" &&
      item.action.type === "search",
  );
  const refused = response.output.some(
    (item) =>
      item.type === "message" && item.content.some((content) => content.type === "refusal"),
  );
  if (
    response.status !== "completed" ||
    response.error !== null ||
    response.incomplete_details !== null ||
    refused ||
    completedSearches.length === 0
  ) {
    throw new CompanySearchError("invalid_provider_response", 502);
  }

  let unknownOutput: unknown;
  try {
    unknownOutput = JSON.parse(response.output_text);
  } catch {
    throw new CompanySearchError("invalid_provider_response", 502);
  }
  const parsed = RESPONSE_SCHEMA.safeParse(unknownOutput);
  const sources = sourceList(response);
  if (!parsed.success || sources.length === 0) {
    throw new CompanySearchError("invalid_provider_response", 502);
  }
  return {
    suggestion: {
      industry: parsed.data.industry,
      capabilities: parsed.data.capabilities,
      summary: parsed.data.summary,
      confident: parsed.data.confident,
      sources,
    },
    searched: true,
    responseId: response.id,
    model: "gpt-5.6",
  };
}
