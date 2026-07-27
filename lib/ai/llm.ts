/**
 * AI 호출 진입점 — 작업(extract/ask)별 제공자·모델로 라우팅한다.
 * extract/ask 등 도메인 코드는 이 파일만 알면 된다.
 *
 * 설정이 비어 있으면 "활성 제공자 + 그 제공자의 기본 모델" 로 동작한다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getValidToken, type AIProvider } from "@/lib/ai/token-store";
import { getAISettings, type AITask } from "@/lib/ai/settings-store";
import { codexRequest, CODEX_MODEL, type AIContent } from "@/lib/ai/codex";
import { claudeRequest, CLAUDE_MODEL } from "@/lib/ai/claude";

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

  // 원하는 제공자가 연결돼 있지 않으면 getValidToken 이 활성 제공자로 대체한다.
  const token = await getValidToken(supabase, ownerId, config.provider ?? undefined);
  const model =
    config.provider === token.provider && config.model
      ? config.model
      : defaultModelFor(token.provider);

  return token.provider === "anthropic-claude"
    ? claudeRequest(token, instructions, content, model)
    : codexRequest(token, instructions, content, model);
}
