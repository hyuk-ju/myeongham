/**
 * 작업별 AI 설정 — 명함 인식(extract), 질문(ask), 회사 정보 검색(enrich)에
 * 서로 다른 제공자/모델을 쓸 수 있게 한다. null 이면 "기본 AI + 기본 모델".
 *
 * enrich 는 웹 검색 서버 도구를 쓰는데, Claude 와 Codex 둘 다 지원한다
 * (codex.ts codexWebSearch 주석 참고).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIProvider } from "@/lib/ai/token-store";

export type AITask = "extract" | "ask" | "enrich";

export interface AITaskConfig {
  provider: AIProvider | null;
  model: string | null;
}

export interface AISettings {
  extract: AITaskConfig;
  ask: AITaskConfig;
  enrich: AITaskConfig;
}

const EMPTY: AISettings = {
  extract: { provider: null, model: null },
  ask: { provider: null, model: null },
  enrich: { provider: null, model: null },
};

interface SettingsRow {
  extract_provider: AIProvider | null;
  extract_model: string | null;
  ask_provider: AIProvider | null;
  ask_model: string | null;
  enrich_provider: AIProvider | null;
  enrich_model: string | null;
}

export async function getAISettings(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<AISettings> {
  const { data, error } = await supabase
    .from("ai_settings")
    .select("extract_provider, extract_model, ask_provider, ask_model, enrich_provider, enrich_model")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(`AI 설정 조회 실패: ${error.message}`);
  if (!data) return EMPTY;

  const row = data as SettingsRow;
  return {
    extract: { provider: row.extract_provider, model: row.extract_model },
    ask: { provider: row.ask_provider, model: row.ask_model },
    enrich: { provider: row.enrich_provider, model: row.enrich_model },
  };
}

export async function saveAISettings(
  supabase: SupabaseClient,
  ownerId: string,
  settings: AISettings,
): Promise<void> {
  const { error } = await supabase.from("ai_settings").upsert({
    owner_id: ownerId,
    extract_provider: settings.extract.provider,
    extract_model: settings.extract.model,
    ask_provider: settings.ask.provider,
    ask_model: settings.ask.model,
    enrich_provider: settings.enrich.provider,
    enrich_model: settings.enrich.model,
  });
  if (error) throw new Error(`AI 설정 저장 실패: ${error.message}`);
}
