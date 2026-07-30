import "server-only";

import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
} from "openai";
import {
  COMPANY_SEARCH_ARGUMENT_SCHEMA,
  COMPANY_SEARCH_INPUT_SCHEMA,
  CompanySearchError,
  parseOpenAICompanyResponse,
  STRUCTURED_FORMAT,
  type CompanySearchResult,
} from "@/lib/ai/openai-company-search-contract";

export {
  COMPANY_SEARCH_ARGUMENT_SCHEMA,
  COMPANY_SEARCH_INPUT_SCHEMA,
  COMPANY_SEARCH_ERROR_CODES,
  CompanySearchError,
  type CompanySearchErrorCode,
  type CompanySearchResult,
  type EnrichSource,
  type OpenAIEnrichSuggestion,
} from "@/lib/ai/openai-company-search-contract";

export interface CompanySearchInput {
  readonly company: string;
  readonly companyEn: string | null;
  readonly website: string | null;
  readonly address: string | null;
  readonly taxCode: string | null;
}

export function parseCompanySearchInput(value: unknown): CompanySearchInput | null {
  const parsed = COMPANY_SEARCH_INPUT_SCHEMA.safeParse(value);
  if (!parsed.success) return null;
  return {
    company: parsed.data.company,
    companyEn: parsed.data.company_en ?? null,
    website: parsed.data.website ?? null,
    address: parsed.data.address ?? null,
    taxCode: parsed.data.tax_code ?? null,
  };
}

export interface CompanySearchRuntime {
  readonly fetch?: typeof fetch;
  readonly now: () => number;
  readonly sleep: (delayMs: number) => Promise<void>;
  readonly deadline?: (remainingMs: number) => {
    readonly signal: AbortSignal;
    readonly dispose: () => void;
  };
}

export interface CompanySearchConfig {
  readonly apiKey: string | null;
  readonly model: string | null;
}

const DEFAULT_RUNTIME: CompanySearchRuntime = {
  now: () => performance.now(),
  sleep: (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
  deadline: (remainingMs) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remainingMs);
    return {
      signal: controller.signal,
      dispose: () => clearTimeout(timer),
    };
  },
};

const MAX_DURATION_MS = 60_000;
const NEXT_REQUEST_RESERVE_MS = 1_000;

function retryAfterMs(error: APIError, fallback: number): number {
  if (error.status !== 429) return fallback;
  const raw = error.headers?.get("retry-after");
  if (!raw || !/^(0|[1-9]\d*)$/.test(raw)) return fallback;
  const seconds = Number(raw);
  if (!Number.isSafeInteger(seconds)) return fallback;
  return Math.min(seconds * 1_000, 5_000);
}

function terminalHttpError(status: number): CompanySearchError {
  if (status === 401 || status === 403) {
    return new CompanySearchError("provider_unconfigured", 503);
  }
  if (status === 429) return new CompanySearchError("rate_limited", 429);
  return new CompanySearchError("upstream_failure", 502);
}

export async function searchCompanyWithOpenAI(
  input: CompanySearchInput,
  config: CompanySearchConfig,
  runtime: CompanySearchRuntime = DEFAULT_RUNTIME,
): Promise<CompanySearchResult> {
  if (!COMPANY_SEARCH_ARGUMENT_SCHEMA.safeParse(input).success) {
    throw new CompanySearchError("invalid_input", 400);
  }
  if (!config.apiKey || config.model !== "gpt-5.6") {
    throw new CompanySearchError("provider_unconfigured", 503);
  }
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: "https://api.openai.com/v1",
    maxRetries: 0,
    timeout: MAX_DURATION_MS,
    ...(runtime.fetch ? { fetch: runtime.fetch } : {}),
  });
  const startedAt = runtime.now();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const elapsed = runtime.now() - startedAt;
    const remaining = MAX_DURATION_MS - elapsed;
    if (remaining <= 0) throw new CompanySearchError("upstream_failure", 504);
    const deadline = (runtime.deadline ?? DEFAULT_RUNTIME.deadline)?.(remaining);
    try {
      const response = await client.responses.create(
        {
          model: "gpt-5.6",
          instructions:
            "Research the company using current web sources and return only the requested structured fields.",
          input: JSON.stringify(input),
          tools: [{ type: "web_search" }],
          tool_choice: "required",
          include: ["web_search_call.action.sources"],
          store: false,
          text: { format: STRUCTURED_FORMAT },
        },
        { maxRetries: 0, timeout: remaining, signal: deadline?.signal },
      );
      return parseOpenAICompanyResponse(response);
    } catch (error) {
      if (error instanceof CompanySearchError) throw error;
      if (error instanceof APIUserAbortError || error instanceof APIConnectionTimeoutError) {
        throw new CompanySearchError("upstream_failure", 504);
      }
      if (error instanceof APIError && error.status !== undefined) {
        const retryable = error.status === 429 || error.status >= 500;
        if (!retryable || attempt === 2) throw terminalHttpError(error.status);
        const fallback = attempt === 0 ? 500 : 1_000;
        const delay = retryAfterMs(error, fallback);
        const spent = runtime.now() - startedAt;
        if (spent + delay + NEXT_REQUEST_RESERVE_MS >= MAX_DURATION_MS) {
          throw terminalHttpError(error.status);
        }
        await runtime.sleep(delay);
        continue;
      }
      if (error instanceof APIConnectionError || error instanceof TypeError) {
        throw new CompanySearchError("upstream_failure", 502);
      }
      throw new CompanySearchError("upstream_failure", 502);
    } finally {
      deadline?.dispose();
    }
  }
  throw new CompanySearchError("upstream_failure", 502);
}
