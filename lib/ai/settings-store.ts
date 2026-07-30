/**
 * 작업별 AI 설정 — 명함 인식(extract), 질문(ask), 회사 정보 검색(enrich)에
 * 서로 다른 제공자/모델을 쓸 수 있게 한다. null 이면 "기본 AI + 기본 모델".
 *
 * enrich 는 웹 검색 서버 도구를 쓰는데, Claude 와 Codex 둘 다 지원한다
 * (codex.ts codexWebSearch 주석 참고).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIProvider } from "@/lib/ai/token-store";
import type { EnrichProvider } from "@/lib/ai/provider-types";

export type AITask = "extract" | "ask" | "enrich";

export interface AITaskConfig {
  provider: AIProvider | null;
  model: string | null;
}

export interface AISettings {
  extract: AITaskConfig;
  ask: AITaskConfig;
  enrich: EnrichTaskConfig;
}

export interface EnrichTaskConfig {
  provider: EnrichProvider | null;
  model: string | null;
}

export interface StoredAISettings {
  extract: AITaskConfig;
  ask: AITaskConfig;
  enrich: EnrichTaskConfig;
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
  enrich_provider: EnrichProvider | null;
  enrich_model: string | null;
}

interface EnrichSettingsRow {
  enrich_provider: EnrichProvider | null;
  enrich_model: string | null;
}

function readEnrichConfig(row: EnrichSettingsRow | null): EnrichTaskConfig {
  if (row?.enrich_provider === "openai-api") return { provider: "openai-api", model: null };
  if (row?.enrich_provider === "openai-codex" || row?.enrich_provider === "anthropic-claude") {
    return { provider: row.enrich_provider, model: row.enrich_model };
  }
  return { provider: null, model: null };
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
    enrich: readEnrichConfig(row),
  };
}

export async function getEnrichSettings(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<EnrichTaskConfig> {
  const { data, error } = await supabase
    .from("ai_settings")
    .select("enrich_provider, enrich_model")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(`AI 설정 조회 실패: ${error.message}`);
  return readEnrichConfig(data as EnrichSettingsRow | null);
}

export async function saveAISettings(
  supabase: SupabaseClient,
  ownerId: string,
  settings: StoredAISettings,
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
