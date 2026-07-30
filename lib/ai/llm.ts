/**
 * AI 호출 진입점 — 작업(extract/ask)별 제공자·모델로 라우팅한다.
 * extract/ask 등 도메인 코드는 이 파일만 알면 된다.
 *
 * 설정이 비어 있으면 "활성 제공자 + 그 제공자의 기본 모델" 로 동작한다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getValidToken, type AIProvider } from "@/lib/ai/token-store";
import { getAISettings, type AITask } from "@/lib/ai/settings-store";
import {
  codexRequest,
  codexWebSearch,
  CODEX_MODEL,
  type AIContent,
  type WebSearchOutcome,
} from "@/lib/ai/codex";
import { claudeRequest, claudeWebSearch, CLAUDE_MODEL } from "@/lib/ai/claude";
import { CompanySearchError } from "@/lib/ai/openai-company-search";

export type { AIContent };
export { parseJsonObject } from "@/lib/ai/codex";

/** 제공자별 선택 가능한 모델 카탈로그 (설정 화면과 공유) */
export const MODEL_CATALOG: Record<
  AIProvider,
  { label: string; models: { id: string; label: string; vision: boolean }[] }
> = {
  "openai-codex": {
    label: "ChatGPT",
    models: [
      { id: "gpt-5.5", label: "GPT-5.5", vision: true },
      { id: "gpt-5.5-codex", label: "GPT-5.5 Codex", vision: true },
      { id: "gpt-5.1-codex-max", label: "GPT-5.1 Codex Max", vision: true },
      { id: "gpt-5.1", label: "GPT-5.1", vision: true },
    ],
  },
  "anthropic-claude": {
    label: "Claude",
    models: [
      { id: "claude-sonnet-5", label: "Sonnet 5", vision: true },
      { id: "claude-opus-5", label: "Opus 5", vision: true },
      { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", vision: true },
    ],
  },
};

export function defaultModelFor(provider: AIProvider): string {
  return provider === "anthropic-claude" ? CLAUDE_MODEL : CODEX_MODEL;
}

export async function callAI(
  supabase: SupabaseClient,
  ownerId: string,
  task: AITask,
  instructions: string,
  content: AIContent[],
): Promise<string> {
  const settings = await getAISettings(supabase, ownerId);
  const config = settings[task];

  if (task === "enrich" && config.provider === "openai-api") {
    throw new CompanySearchError("provider_unconfigured", 503);
  }
  const preferredProvider =
    config.provider === "openai-api" ? undefined : config.provider ?? undefined;
  const token = await getValidToken(supabase, ownerId, preferredProvider);
  const model =
    config.provider === token.provider && config.model
      ? config.model
      : defaultModelFor(token.provider);

  return token.provider === "anthropic-claude"
    ? claudeRequest(token, instructions, content, model)
    : codexRequest(token, instructions, content, model);
}

/**
 * 웹 검색을 붙여 호출한다 (회사 정보 보강용).
 *
 * Claude 와 Codex 둘 다 서버측 웹 검색 도구를 지원한다. 어느 쪽을 쓸지는
 * callAI 와 똑같이 작업별 설정 → 기본 AI 순으로 정해지므로, 한쪽이 사용량
 * 한도에 걸리면 설정에서 반대쪽으로 넘겨 계속 쓸 수 있다.
 */
export async function webSearch(
  supabase: SupabaseClient,
  ownerId: string,
  task: AITask,
  instructions: string,
  prompt: string,
): Promise<WebSearchOutcome & { provider: AIProvider }> {
  const settings = await getAISettings(supabase, ownerId);
  const config = settings[task];

  if (config.provider === "openai-api") {
    throw new Error("openai-api company search must use the Responses adapter");
  }
  const token = await getValidToken(supabase, ownerId, config.provider ?? undefined);
  const model =
    config.provider === token.provider && config.model
      ? config.model
      : defaultModelFor(token.provider);

  const outcome =
    token.provider === "anthropic-claude"
      ? await claudeWebSearch(token, instructions, prompt, model)
      : await codexWebSearch(token, instructions, prompt, model);

  return { ...outcome, provider: token.provider };
}
