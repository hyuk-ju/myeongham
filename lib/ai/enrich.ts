/**
 * Phase 4 — 회사 웹 검색으로 역량 태그 보강.
 *
 * 명함에는 "이 회사가 무엇을 만드는지" 가 거의 안 적혀 있다. OCR 만으로는
 * "A 설비를 만들 수 있는 회사" 질의에 답할 수 없으므로, 회사명으로 웹을 뒤져
 * 업종·취급품목을 추론해 채워 넣는다.
 *
 * 자동 저장하지 않는다 — 웹 검색은 동명이인/동명회사로 오답이 날 수 있어
 * 반드시 사용자가 보고 승인한 뒤 저장한다 (capabilities_source='web').
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getValidToken } from "@/lib/ai/token-store";
import { getAISettings } from "@/lib/ai/settings-store";
import { claudeWebSearch, CLAUDE_MODEL } from "@/lib/ai/claude";
import { parseJsonObject } from "@/lib/ai/codex";

export interface EnrichSuggestion {
  industry: string | null;
  capabilities: string[];
  summary: string | null;
  /** 회사를 특정하지 못했으면 false — 이때는 저장을 권하지 않는다 */
  confident: boolean;
  sources: string[];
}

const INSTRUCTIONS = `당신은 기업 정보 조사원입니다. 주어진 회사를 웹에서 찾아 "이 회사가 무엇을 만들고 취급하는지" 를 정리합니다.

조사 방법:
- 회사명으로 검색하고, 필요하면 명함에 있던 웹사이트·주소·사업자번호를 함께 써서 동명 회사와 구분하세요.
- 공식 홈페이지, 기업정보 사이트, 채용 공고, 뉴스 순으로 신뢰하세요.

출력은 JSON 객체 하나만. 코드펜스·설명 금지.
스키마: {"industry":string|null,"capabilities":string[],"summary":string|null,"confident":boolean}

- industry: 업종을 한국어 명사구로 (예: "PCB 제조", "산업용 밸브 유통"). 못 찾으면 null.
- capabilities: 이 회사가 만들거나 취급하는 품목·공정을 한국어 명사형 태그 배열로 (예: ["PCB","연성회로기판","SMT"]). 3~8개. 근거 없으면 [].
- summary: 이 회사가 뭐 하는 곳인지 한두 문장. 못 찾으면 null.
- confident: 검색 결과가 이 회사를 특정했다고 확신하면 true. 동명 회사가 많아 헷갈리거나 정보를 못 찾았으면 false.

**추측 금지.** 검색으로 확인한 내용만 쓰세요. 못 찾았으면 confident=false 로 두고 빈 값을 반환하세요.`;

export interface EnrichInput {
  company: string;
  companyEn?: string | null;
  website?: string | null;
  address?: string | null;
  taxCode?: string | null;
}

export async function enrichCompany(
  supabase: SupabaseClient,
  ownerId: string,
  input: EnrichInput,
): Promise<EnrichSuggestion> {
  // 웹 검색은 Claude 서버 도구를 쓴다. Codex 백엔드에는 대응 표면이 없다.
  const settings = await getAISettings(supabase, ownerId);
  const token = await getValidToken(supabase, ownerId, "anthropic-claude");
  if (token.provider !== "anthropic-claude") {
    throw new Error(
      "웹 검색 보강은 Claude 연결이 필요합니다. 설정에서 Claude를 연결하세요.",
    );
  }

  const model =
    settings.ask.provider === "anthropic-claude" && settings.ask.model
      ? settings.ask.model
      : CLAUDE_MODEL;

  const hints = [
    `회사명: ${input.company}`,
    input.companyEn && input.companyEn !== input.company
      ? `영문명: ${input.companyEn}`
      : null,
    input.website ? `웹사이트: ${input.website}` : null,
    input.address ? `주소: ${input.address}` : null,
    input.taxCode ? `사업자번호/Taxcode: ${input.taxCode}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const { text, sources, searched, searchError } = await claudeWebSearch(
    token,
    INSTRUCTIONS,
    `다음 회사를 조사해 주세요.\n\n${hints}`,
    model,
  );

  // 검색이 아예 안 됐으면 모델이 기억으로 답한 것이므로 결과를 쓰면 안 된다.
  if (!searched) {
    throw new Error(
      searchError === "too_many_requests"
        ? "웹 검색 사용량 한도에 걸렸습니다. 잠시 후 다시 시도하세요."
        : "웹 검색이 실행되지 않아 조사를 완료하지 못했습니다. 잠시 후 다시 시도하세요.",
    );
  }

  const parsed = parseJsonObject(text);
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

  return {
    industry: str(parsed.industry),
    capabilities: Array.isArray(parsed.capabilities)
      ? [
          ...new Set(
            parsed.capabilities
              .filter((t): t is string => typeof t === "string" && !!t.trim())
              .map((t) => t.trim()),
          ),
        ].slice(0, 12)
      : [],
    summary: str(parsed.summary),
    confident: parsed.confident === true,
    sources,
  };
}
