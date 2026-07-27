/**
 * 자연어 질의 파이프라인 (Phase 3).
 *
 * 1) 질문 → 검색조건 JSON (AI)
 * 2) Postgres 필터 검색 → 후보 (0건이면 조건 완화 후 재검색)
 * 3) 후보를 컨텍스트에 넣고 AI가 표로 취합
 *
 * 벡터 검색을 쓰지 않는 이유: 3,000장 이하에서는 필터 검색이 더 정확하고
 * 저렴하다 (계획서 참조).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { callAI, parseJsonObject } from "@/lib/ai/llm";

const MAX_CANDIDATES = 60;

interface SearchFilters {
  keywords: string[];
  capability_tags: string[];
  industry: string | null;
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

const FILTER_INSTRUCTIONS = `사용자의 질문을 명함 데이터베이스 검색조건으로 변환합니다. JSON 객체 하나만 출력하세요. 코드펜스, 설명 금지.

스키마: {"keywords":string[],"capability_tags":string[],"industry":string|null,"company_hint":string|null}

- keywords: 회사명/이름/메모 등 텍스트 검색에 쓸 핵심 단어들. 조사를 뗀 명사형으로. 동의어·유사어도 2~3개 포함 (예: "가공" → ["가공","기계가공","머시닝"]).
- capability_tags: 질문이 "~를 만드는/하는 회사"를 찾는 것이면 그 역량을 명사형 태그로 (예: "정밀가공", "사출금형"). 아니면 [].
- industry: 업종이 특정되면 그 업종, 아니면 null.
- company_hint: 특정 회사를 지목하면 그 회사명, 아니면 null.`;

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
- note: 사용자에게 전할 코멘트 (검색 한계, 추가 확인 제안 등). 없으면 null.`;
}

function sanitizeTerm(term: string): string {
  // PostgREST or() 구문과 충돌하는 문자를 제거한다.
  return term.replace(/[,()%.]/g, " ").trim();
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
  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((t): t is string => typeof t === "string" && !!t.trim()) : [];
  return {
    keywords: strArr(parsed.keywords),
    capability_tags: strArr(parsed.capability_tags),
    industry: typeof parsed.industry === "string" && parsed.industry.trim() ? parsed.industry : null,
    company_hint:
      typeof parsed.company_hint === "string" && parsed.company_hint.trim()
        ? parsed.company_hint
        : null,
  };
}

/** or() 조건 문자열: 키워드/태그/업종/회사명을 전부 OR 로 묶는다. */
function buildOrConditions(filters: SearchFilters): string[] {
  const conditions: string[] = [];
  const terms = new Set<string>();
  for (const k of filters.keywords) {
    const t = sanitizeTerm(k);
    if (t) terms.add(t);
  }
  if (filters.industry) {
    const t = sanitizeTerm(filters.industry);
    if (t) terms.add(t);
  }
  if (filters.company_hint) {
    const t = sanitizeTerm(filters.company_hint);
    if (t) terms.add(t);
  }
  for (const term of terms) {
    for (const col of [
      "company", "company_en", "name", "name_en", "industry",
      "address", "raw_text", "notes", "met_context",
    ]) {
      conditions.push(`${col}.ilike.*${term}*`);
    }
  }
  const tags = filters.capability_tags
    .map(sanitizeTerm)
    .filter(Boolean);
  if (tags.length) {
    conditions.push(`capabilities.ov.{${tags.map((t) => `"${t}"`).join(",")}}`);
    // 태그가 아직 안 달린 명함도 텍스트로 잡히게 ilike 도 추가
    for (const tag of tags) {
      conditions.push(`raw_text.ilike.*${tag}*`);
      conditions.push(`industry.ilike.*${tag}*`);
    }
  }
  return conditions;
}

async function searchCandidates(
  supabase: SupabaseClient,
  filters: SearchFilters,
): Promise<Candidate[]> {
  const conditions = buildOrConditions(filters);

  if (conditions.length) {
    const { data, error } = await supabase
      .from("cards")
      .select(CANDIDATE_COLUMNS)
      .eq("is_current", true)
      .or(conditions.join(","))
      .limit(MAX_CANDIDATES);
    if (error) throw new Error(`후보 검색 실패: ${error.message}`);
    if (data && data.length) return data as unknown as Candidate[];
  }

  // 조건 검색이 0건 → 전체에서 최근 순으로 가져와 AI가 직접 거르게 한다.
  // (개인 명함첩 규모에서는 이게 가장 안전한 완화 전략)
  const { data, error } = await supabase
    .from("cards")
    .select(CANDIDATE_COLUMNS)
    .eq("is_current", true)
    .order("created_at", { ascending: false })
    .limit(MAX_CANDIDATES);
  if (error) throw new Error(`후보 검색 실패: ${error.message}`);
  return (data ?? []) as unknown as Candidate[];
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
