/**
 * 자연어 질의 파이프라인 (Phase 3).
 *
 * 1) 질문 → 검색 후보어 목록 (AI). 한/영·상위어까지 펼친다
 * 2) search_cards RPC 로 후보 검색 (많이 걸린 순)
 * 3) 후보를 컨텍스트에 넣고 AI가 표로 취합
 *
 * 왜 후보어를 펼치나: 검색이 단순 문자열 포함 비교라서 표기가 다르면 못 찾는다.
 * 실제로 "핫프레스" 로 물었을 때 태그가 'Hot press' 인 회사가 안 잡혔다.
 *
 * 벡터 검색을 쓰지 않는 이유: 구독 OAuth 경로에는 임베딩 API 가 없다. 3,000장
 * 이하에서는 후보어 확장 + AI 판단으로 충분하다 (계획서 참조).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { callAI, parseJsonObject } from "@/lib/ai/llm";

const MAX_CANDIDATES = 60;
/** 후보가 이보다 적으면 최근 명함으로 채워 AI 가 직접 거르게 한다 */
const MIN_CANDIDATES = 15;

interface SearchFilters {
  terms: string[];
  company_hint: string | null;
}

export interface AskRow {
  card_id: string | null;
  company: string | null;
  name: string | null;
  title: string | null;
  phone: string | null;
  email: string | null;
  why: string | null;
}

export interface AskResult {
  rows: AskRow[];
  note: string | null;
  candidateCount: number;
  filters: SearchFilters;
}

interface Candidate {
  id: string;
  company: string | null;
  company_en: string | null;
  name: string | null;
  name_en: string | null;
  title: string | null;
  department: string | null;
  phone: string | null;
  mobile: string | null;
  mobile2: string | null;
  email: string | null;
  email2: string | null;
  address: string | null;
  industry: string | null;
  capabilities: string[];
  notes: string | null;
  met_context: string | null;
}

const CANDIDATE_COLUMNS =
  "id, company, company_en, name, name_en, title, department, phone, mobile, mobile2, email, email2, address, industry, capabilities, notes, met_context";

const FILTER_INSTRUCTIONS = `사용자의 질문을 명함 검색용 후보어 목록으로 바꿉니다. JSON 객체 하나만 출력하세요. 코드펜스, 설명 금지.

스키마: {"terms":string[],"company_hint":string|null}

terms 는 명함 텍스트(회사명·업종·역량태그·메모·원문)에 **부분 문자열로 그대로 들어있을 법한 표기**여야 합니다. 검색은 단순 문자열 포함 비교라서, 표기가 다르면 못 찾습니다. 그래서 같은 개념을 여러 표기로 펼쳐 주세요.

각 핵심 개념마다 아래를 모두 넣으세요:
1. **한글 표기** — 붙여쓰기와 띄어쓰기 둘 다 (예: "핫프레스", "핫 프레스")
2. **영문 표기** — 명함·회사 소개는 영문인 경우가 많습니다 (예: "hot press", "hotpress")
3. **상위 개념** — 더 넓은 말 (예: 핫프레스 → "프레스", 열압착)
4. **현장에서 같이 쓰는 말** (예: 라미네이션, 압착)

예시:
- "핫프레스 하는 회사" → ["핫프레스","핫 프레스","hot press","hotpress","프레스","열압착","라미네이션","press"]
- "정밀가공 되는 곳" → ["정밀가공","정밀 가공","precision machining","machining","가공","CNC","머시닝"]
- "PCB 검사장비" → ["PCB 검사","검사장비","inspection","AOI","PCB","장비"]

주의:
- 짧고 흔한 조각(예: "사","템","co")은 넣지 마세요. 아무 데나 걸립니다.
- 한 글자짜리 term 은 넣지 마세요.
- 8~12개 정도가 적당합니다.
- 사람 이름·회사명을 찾는 질문이면 그 이름 자체를 terms 에 넣으세요.

company_hint: 특정 회사를 지목하는 질문이면 회사명, 아니면 null.`;

function composeInstructions(): string {
  return `당신은 개인 명함첩의 검색 비서입니다. 사용자의 질문과 명함 후보 목록(JSON)이 주어집니다. 질문에 맞는 명함을 골라 연락처 표를 만드세요.

JSON 객체 하나만 출력합니다. 코드펜스, 설명 금지.
스키마: {"rows":[{"card_id":string,"company":string|null,"name":string|null,"title":string|null,"phone":string|null,"email":string|null,"why":string}],"note":string|null}

규칙:
- rows: 질문에 부합하는 명함만. 관련성 높은 순서로. card_id 는 후보의 id 를 그대로.
- company: 한글 회사명이 있으면 그것을, 없으면 company_en 을 쓴다. name 도 동일.
- phone: mobile 이 있으면 mobile, 없으면 mobile2, 그것도 없으면 phone. 없으면 null.
- why: 이 명함을 고른 근거를 한 문장으로 (예: "역량 태그에 정밀가공 포함").
- 후보에 없는 정보를 지어내지 말 것. 확실치 않으면 제외하고 note 에 설명.
- 부합하는 명함이 없으면 rows 는 [] 로 하고 note 에 이유를 쓰세요.
- note: 사용자에게 전할 코멘트 (검색 한계, 추가 확인 제안 등). 없으면 null.

**표기가 달라도 실제로 하는 일이 맞으면 포함하세요.** 후보 목록은 넉넉히 뽑아
보낸 것이라 질문과 무관한 명함도 섞여 있습니다. 판단 기준은 글자 일치가 아니라
의미입니다:
- 한글/영문 표기 차이 — "Hot press" 는 "핫프레스" 입니다
- 상위/하위 개념 — "프레스 장비 제조" 하는 회사는 핫프레스도 할 수 있습니다.
  다만 확실하지 않으면 why 에 "프레스 장비 제조 — 핫프레스 여부는 확인 필요"
  처럼 불확실함을 적으세요
- 같은 회사가 여러 건이면 정보가 많은 쪽 하나만 고르세요

확실한 것을 먼저, 가능성 있는 것을 뒤에 두고, 뒤쪽은 why 에 근거의 불확실함을
밝히세요. 아예 빠뜨리는 것보다 낫습니다.`;
}

/** 너무 짧거나 흔한 조각은 아무 데나 걸리므로 버린다. */
function usableTerm(term: string): boolean {
  const t = term.trim();
  if (t.length < 2) return false;
  return !/^(주|사|co|ltd|inc|the|and)$/i.test(t);
}

async function parseQuestion(
  supabase: SupabaseClient,
  ownerId: string,
  question: string,
): Promise<SearchFilters> {
  const raw = await callAI(supabase, ownerId, "ask", FILTER_INSTRUCTIONS, [
    { type: "input_text", text: question },
  ]);
  const parsed = parseJsonObject(raw);

  const terms = Array.isArray(parsed.terms)
    ? [
        ...new Set(
          parsed.terms
            .filter((t): t is string => typeof t === "string")
            .map((t) => t.trim())
            .filter(usableTerm),
        ),
      ]
    : [];

  const hint =
    typeof parsed.company_hint === "string" && parsed.company_hint.trim()
      ? parsed.company_hint.trim()
      : null;
  if (hint && usableTerm(hint) && !terms.includes(hint)) terms.push(hint);

  return { terms, company_hint: hint };
}

/**
 * 후보 검색. search_cards RPC 가 capabilities 배열까지 텍스트로 펼쳐 훑으므로
 * 'Hot press' 같은 영문 태그도 잡힌다.
 *
 * 결과가 너무 적으면 최근 명함으로 채운다 — 후보어 확장이 빗나가도 AI 가 직접
 * 판단할 기회를 남기기 위해서다.
 */
async function searchCandidates(
  supabase: SupabaseClient,
  filters: SearchFilters,
): Promise<Candidate[]> {
  const byId = new Map<string, Candidate>();

  if (filters.terms.length) {
    const { data, error } = await supabase.rpc("search_cards", {
      p_terms: filters.terms,
      p_limit: MAX_CANDIDATES,
    });
    if (error) throw new Error(`후보 검색 실패: ${error.message}`);
    for (const row of (data ?? []) as Candidate[]) byId.set(row.id, row);
  }

  if (byId.size < MIN_CANDIDATES) {
    const { data, error } = await supabase
      .from("cards")
      .select(CANDIDATE_COLUMNS)
      .eq("is_current", true)
      .order("created_at", { ascending: false })
      .limit(MAX_CANDIDATES);
    if (error) throw new Error(`후보 검색 실패: ${error.message}`);
    for (const row of (data ?? []) as unknown as Candidate[]) {
      if (byId.size >= MAX_CANDIDATES) break;
      if (!byId.has(row.id)) byId.set(row.id, row);
    }
  }

  return [...byId.values()];
}

export async function askCards(
  supabase: SupabaseClient,
  ownerId: string,
  question: string,
): Promise<AskResult> {
  const filters = await parseQuestion(supabase, ownerId, question);
  const candidates = await searchCandidates(supabase, filters);

  if (!candidates.length) {
    return {
      rows: [],
      note: "등록된 명함이 없습니다. 먼저 명함을 등록하세요.",
      candidateCount: 0,
      filters,
    };
  }

  const raw = await callAI(supabase, ownerId, "ask", composeInstructions(), [
    {
      type: "input_text",
      text: `질문: ${question}\n\n명함 후보 (${candidates.length}건):\n${JSON.stringify(candidates)}`,
    },
  ]);
  const parsed = parseJsonObject(raw);

  const validIds = new Set(candidates.map((c) => c.id));
  const rows: AskRow[] = Array.isArray(parsed.rows)
    ? (parsed.rows as Record<string, unknown>[]).map((r) => {
        const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
        const id = str(r.card_id);
        return {
          card_id: id && validIds.has(id) ? id : null,
          company: str(r.company),
          name: str(r.name),
          title: str(r.title),
          phone: str(r.phone),
          email: str(r.email),
          why: str(r.why),
        };
      })
    : [];

  return {
    rows,
    note: typeof parsed.note === "string" && parsed.note.trim() ? parsed.note.trim() : null,
    candidateCount: candidates.length,
    filters,
  };
}
