/**
 * Phase 4 — 회사 웹 검색으로 역량 태그 보강.
 *
 * 명함에는 "이 회사가 무엇을 만드는지" 가 거의 안 적혀 있다. OCR 만으로는
 * "A 설비를 만들 수 있는 회사" 질의에 답할 수 없으므로, 회사명으로 웹을 뒤져
 * 업종·취급품목을 추론해 채워 넣는다.
 *
 * 자동 저장하지 않는다 — 웹 검색은 동명이인/동명회사로 오답이 날 수 있어
 * 반드시 사용자가 보고 승인한 뒤 저장한다 (capabilities_source='web').
 *
 * Claude·Codex 둘 다 웹 검색 서버 도구를 지원한다. 어느 쪽을 쓸지는 설정의
 * '회사 정보 검색' 항목이 정하고, 실제 분기는 llm.ts 의 webSearch 가 맡는다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { webSearch, parseJsonObject } from "@/lib/ai/llm";

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
**본문에 출처 링크나 각주를 넣지 마세요** — 출처는 별도로 수집합니다.
"([도메인](주소))" 같은 인용 표기가 섞이면 JSON 파싱이 깨집니다.
스키마: {"industry":string|null,"capabilities":string[],"summary":string|null,"confident":boolean}

- industry: 업종을 한국어 명사구로 (예: "PCB 제조", "산업용 밸브 유통"). 못 찾으면 null.
- summary: 이 회사가 뭐 하는 곳인지 한두 문장. 못 찾으면 null.
- confident: 검색 결과가 이 회사를 특정했다고 확신하면 true. 동명 회사가 많아 헷갈리거나 정보를 못 찾았으면 false.

## capabilities — 가장 중요한 항목

나중에 사용자가 **"핫프레스 되는 회사 연락처 뽑아줘"** 같이 물었을 때 이 태그로
찾습니다. 동시에 상세 화면에 그대로 보이는 목록이기도 합니다.
**적고 정확한 쪽이 많고 어수선한 쪽보다 낫습니다.**

**1) 한국어 표기 하나만 쓰세요. 같은 개념을 한글과 영문으로 두 번 넣지 마세요.**
질문은 검색 단계에서 한/영으로 자동 확장되므로 영문 태그를 따로 저장할 이유가
없습니다. 두 벌로 넣으면 화면만 두 배로 지저분해집니다.
- 나쁨: ["주조","casting","단조","forging","프레스 가공","press stamping"]
- 좋음: ["주조","단조","프레스 가공"]
- 예외: 국내 현장에서 영문으로 굳어진 말은 그대로 (PCB, SMT, CNC, AOI, PLC, HDI)

**2) 구체적인 공정·품목 이름을 쓰세요.**
"장비 제조" 처럼 뭉뚱그리지 말고 실제로 뭘 만드는지 적으세요.
- 나쁨: ["장비 제조", "산업기계"]
- 좋음: ["핫프레스", "프레스 장비 제조", "자동화장비 설계·제조", "PCB 장비"]

**3) 표준산업분류 문구는 넣지 마세요.**
"금속제품 제조", "기타 기계 및 장비 제조업" 같은 분류 표현은 어느 회사에나
붙어서 검색에 도움이 안 됩니다. 그런 내용은 industry 에 한 줄로 넣으세요.

**4) 상위어로 자리를 채우지 마세요.**
"핫프레스" 가 있으면 "프레스" 는 따로 넣지 않아도 됩니다. 넓은 질문은 검색
단계에서 알아서 확장합니다.

**5) 개수: 4~7개.** 확실한 것만 고르고 8개를 넘기지 마세요. 회사가 하는 일이
많아도 대표 공정 위주로 추리세요.

**6) 회사명·주소·사람 이름은 태그가 아닙니다.** 넣지 마세요.

예시 — 프레스/자동화 장비 회사를 조사했다면:
["핫프레스","프레스 장비 제조","자동화장비 설계·제조","PCB 장비","라미네이션"]

**추측 금지.** 검색으로 확인한 내용만 쓰세요. 못 찾았으면 confident=false 로 두고
빈 값을 반환하세요.`;

/** 화면에 그대로 보이는 목록이라 개수를 제한한다. 프롬프트는 4~7개를 요구한다. */
const MAX_CAPABILITIES = 8;

/**
 * 표기만 다른 중복을 없앤다 — "프레스 가공" 과 "프레스가공", "PCB 장비" 와
 * "pcb장비" 는 검색상 같은 태그다. 먼저 나온 표기를 남긴다 (모델이 대표 표기를
 * 앞에 두는 편이다).
 *
 * 한글/영문 쌍("주조" vs "casting")은 여기서 걸러낼 수 없다 — 글자가 겹치지
 * 않기 때문이다. 그쪽은 프롬프트에서 막고, 이 함수는 마지막 안전망이다.
 */
function dedupeTags(tags: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    if (typeof raw !== "string") continue;
    const tag = raw.trim();
    if (!tag) continue;
    const key = tag.toLowerCase().replace(/[\s·・,./()\-_]/g, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out.slice(0, MAX_CAPABILITIES);
}

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

  // 어느 AI 로 검색할지는 설정의 '회사 정보 검색' 항목이 정한다 (llm.ts).
  const { text, sources, searched, searchError } = await webSearch(
    supabase,
    ownerId,
    "enrich",
    INSTRUCTIONS,
    `다음 회사를 조사해 주세요.\n\n${hints}`,
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
      ? dedupeTags(parsed.capabilities)
      : [],
    summary: str(parsed.summary),
    confident: parsed.confident === true,
    sources,
  };
}
