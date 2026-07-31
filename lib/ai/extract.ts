/**
 * 명함 이미지 → 구조화 데이터 추출.
 * 실제 호출은 lib/ai/llm.ts 가 담당하고, 여기는 프롬프트와 파싱만 있다.
 *
 * 한국 명함뿐 아니라 베트남·영문 전용 명함도 대상이다. 국가번호(+82/+84)가
 * 붙은 번호는 저장 직전에 현지 표기(010-…, 0368-…)로 정규화한다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { callAI, parseJsonObject } from "@/lib/ai/llm";
import { CARD_LIMITS, normalizeExtractedCard, parseExtractedCard } from "@/lib/http-contracts";
import { normalizePhone, splitMultiValue } from "@/lib/phone";

export interface ExtractedCard {
  name: string | null;
  name_en: string | null;
  title: string | null;
  department: string | null;
  company: string | null;
  company_en: string | null;
  phone: string | null;
  mobile: string | null;
  mobile2: string | null;
  fax: string | null;
  email: string | null;
  email2: string | null;
  website: string | null;
  address: string | null;
  postal_code: string | null;
  tax_code: string | null;
  raw_text: string | null;
  industry: string | null;
  capabilities: string[];
  confidence: number;
}

const FIELD_KEYS: (keyof ExtractedCard)[] = [
  "name", "name_en", "title", "department", "company", "company_en",
  "phone", "mobile", "mobile2", "fax", "email", "email2", "website", "address",
  "postal_code", "tax_code", "raw_text", "industry",
];

/** 전화번호로 취급해 정규화할 필드 */
const PHONE_KEYS: (keyof ExtractedCard)[] = ["phone", "mobile", "mobile2", "fax"];

const INSTRUCTIONS = `당신은 비즈니스 명함 판독 전문가입니다. 한국·베트남·영문 명함을 모두 다룹니다. 명함 이미지에서 정보를 추출해 JSON 하나만 출력합니다.

규칙:
- 출력은 반드시 JSON 객체 하나. 마크다운 코드펜스, 설명, 인사말 금지.
- 읽을 수 없거나 명함에 없는 필드는 null. 절대 추측으로 채우지 말 것.

이름/회사:
- 한글과 영문이 병기되면 각각 name/name_en, company/company_en 에 나눠 담는다.
  예: "송태근 (Song Taegeun)" → name="송태근", name_en="Song Taegeun".
- 영문 전용 명함이면 name 에 영문 이름을 넣고 name_en 은 null 로 둔다
  (name 은 항상 채우고, name_en 은 "병기된 경우의 로마자" 용도).
- 회사명에 법인격(CO., LTD, JSC, Inc.)이 붙어 있으면 그대로 포함한다.

전화번호:
- 국제표기(+82, +84 등)는 **원문 그대로** 옮긴다. 변환은 시스템이 처리한다.
- 라벨을 우선한다: Mobile/휴대폰/H.P → mobile, Tel/Office/사무실/대표 → phone,
  Fax/F → fax.
- **한 필드에는 번호를 하나만** 넣는다. 휴대폰이 두 개면(예: Mobile(VN) 과
  Mobile(KOR)) 첫 번째를 mobile, 두 번째를 mobile2 에 나눠 담는다.
  절대 "번호1 / 번호2" 처럼 한 칸에 합치지 말 것.
- 라벨이 없으면 형태로 판단: 010/+82 10 또는 03x/+84 3x 로 시작하는 10~11자리는
  휴대폰, 02·031 등 지역번호는 사무실.

기타 필드:
- tax_code: Taxcode / Tax / MST / 사업자등록번호 값. 없으면 null.
- address: 주소 전체를 한 줄로 (줄바꿈은 공백으로).
- email: 개인 업무용(이름 기반)을 우선한다. 이메일이 두 개면 나머지를 email2 에
  넣는다. 한 칸에 합치지 말 것.
- raw_text: 명함에 보이는 모든 텍스트를 줄 단위로.
- industry: 명함 단서(회사명, 슬로건, 부서명, 로고 이미지)로 추정한 업종.
  예: "HYUNWOO PCB" → "PCB 제조", 실험기구 이미지 → "실험장비". 단서가 없으면 null.
- capabilities: 이 회사가 만들거나 다루는 것으로 보이는 품목/역량 태그 배열
  (한국어 명사형, 예: "정밀가공", "사출금형", "PCB"). 명함에 근거가 있을 때만. 없으면 [].
  **최대 ${CARD_LIMITS.tags}개**, 태그 하나는 ${CARD_LIMITS.tag}자 이내. 품목이 더 많으면
  대표적인 것부터 골라 ${CARD_LIMITS.tags}개까지만 넣는다.
- confidence: 전체 추출 신뢰도 0~1. 이미지가 흐리거나 일부만 읽혔으면 낮게.

출력 스키마:
{"name":string|null,"name_en":string|null,"title":string|null,"department":string|null,"company":string|null,"company_en":string|null,"phone":string|null,"mobile":string|null,"mobile2":string|null,"fax":string|null,"email":string|null,"email2":string|null,"website":string|null,"address":string|null,"postal_code":string|null,"tax_code":string|null,"raw_text":string|null,"industry":string|null,"capabilities":string[],"confidence":number}`;

/**
 * 모델이 "값1 / 값2" 로 뭉쳐 보낸 경우 두 번째 값을 보조 필드로 옮긴다.
 * 프롬프트로 지시해도 종종 합쳐서 오기 때문에 파싱 단계에서 한 번 더 막는다.
 */
function unmerge(
  card: ExtractedCard,
  primary: "mobile" | "email",
  secondary: "mobile2" | "email2",
): void {
  const parts = splitMultiValue(card[primary]);
  if (parts.length < 2) return;
  card[primary] = parts[0];
  if (!card[secondary]) card[secondary] = parts[1];
}

function parseCardJson(raw: string): ExtractedCard {
  const parsed = parseJsonObject(raw);

  const fields: Record<string, unknown> = {};
  for (const key of FIELD_KEYS) {
    const v = parsed[key];
    fields[key] = typeof v === "string" && v.trim() ? v.trim() : null;
  }
  const card = fields as unknown as ExtractedCard;

  unmerge(card, "mobile", "mobile2");
  unmerge(card, "email", "email2");

  // 국가번호 표기를 현지 표기로 (+82 10-… → 010-…)
  for (const key of PHONE_KEYS) {
    const v = card[key];
    if (typeof v === "string") (card[key] as string) = normalizePhone(v);
  }

  card.capabilities = Array.isArray(parsed.capabilities) ? parsed.capabilities : [];
  card.confidence = Number(parsed.confidence);

  // 저장 전에 응답 계약과 **같은 상한**으로 다듬고 검증한다. 모델은 지시를
  // 어기고 태그를 13개씩 보내기도 하는데, 그대로 저장하면 그 행은 다시 읽히지
  // 않아 대기열 조회 전체가 502 로 죽는다. 여기서 못 막으면 사용자가 스스로
  // 복구할 방법이 없으므로, 통과하지 못한 결과는 아예 저장하지 않는다.
  const contract = parseExtractedCard(normalizeExtractedCard(card));
  if (!contract.ok) throw new Error("추출 결과가 저장 형식을 벗어났습니다.");
  return contract.value as ExtractedCard;
}

/**
 * @param imageDataUrl "data:image/jpeg;base64,..." 형식
 */
export async function extractCardFromImage(
  supabase: SupabaseClient,
  ownerId: string,
  imageDataUrl: string,
): Promise<ExtractedCard> {
  const raw = await callAI(supabase, ownerId, "extract", INSTRUCTIONS, [
    { type: "input_text", text: "이 명함을 분석해 스키마대로 JSON을 출력하세요." },
    { type: "input_image", image_url: imageDataUrl },
  ]);
  return parseCardJson(raw);
}
