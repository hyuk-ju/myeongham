/**
 * 전화번호 정규화 — 국가번호 표기를 현지 표기로 바꾼다.
 *
 *   +82 10-7494-1491  → 010-7494-1491
 *   +82 (0)2 555 0199 → 02-555-0199
 *   +84 368 114 882   → 0368-114-882
 *
 * 확실히 분류되는 경우(+82/+84, 0082/0084)만 변환하고, 나머지는 원문을
 * 그대로 둔다. 애매한 번호를 잘못 바꾸는 것보다 안 바꾸는 쪽이 안전하다.
 */

function digitsOf(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** 한국 번호 하이픈 포맷 (지역번호/휴대폰 자리수 규칙) */
function formatKr(local: string): string {
  if (/^01\d{8,9}$/.test(local)) {
    // 휴대폰 010-XXXX-XXXX (구형 011-XXX-XXXX 포함)
    const mid = local.length === 11 ? 4 : 3;
    return `${local.slice(0, 3)}-${local.slice(3, 3 + mid)}-${local.slice(3 + mid)}`;
  }
  if (/^02\d{7,8}$/.test(local)) {
    const mid = local.length === 10 ? 4 : 3;
    return `02-${local.slice(2, 2 + mid)}-${local.slice(2 + mid)}`;
  }
  if (/^0\d{9,10}$/.test(local)) {
    // 3자리 지역번호 (031, 070 등)
    const mid = local.length === 11 ? 4 : 3;
    return `${local.slice(0, 3)}-${local.slice(3, 3 + mid)}-${local.slice(3 + mid)}`;
  }
  return local;
}

/**
 * 베트남 번호 하이픈 포맷.
 *   휴대폰 10자리      0368-114-882   (0 + 9자리)
 *   유선 11자리(02x)   024-3456-7890  (지역번호 3자리 + 8자리)
 */
function formatVn(local: string): string {
  if (/^02\d{9}$/.test(local)) {
    return `${local.slice(0, 3)}-${local.slice(3, 7)}-${local.slice(7)}`;
  }
  if (/^0\d{9}$/.test(local)) {
    return `${local.slice(0, 4)}-${local.slice(4, 7)}-${local.slice(7)}`;
  }
  return local;
}

export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const compact = trimmed.replace(/\s+/g, "");

  // 국가번호 감지: +82 / 0082 / +84 / 0084 (괄호 (0) 표기 포함)
  const intl = /^(?:\+|00)(82|84)[\s.\-]*(?:\(0\))?/.exec(compact);
  if (intl) {
    const country = intl[1];
    let local = digitsOf(compact.slice(intl[0].length));
    if (!local) return trimmed;
    if (!local.startsWith("0")) local = `0${local}`;
    return country === "82" ? formatKr(local) : formatVn(local);
  }

  // 국가번호가 없는 한국 표기 정리: "054)976-6665" → "054-976-6665"
  if (/^0\d/.test(compact) && /[()]/.test(compact)) {
    const local = digitsOf(compact);
    if (/^0\d{8,10}$/.test(local)) return formatKr(local);
  }

  return trimmed;
}

/** null/빈값을 통과시키는 버전 — DB 저장 직전에 쓴다 */
export function normalizePhoneOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return normalizePhone(value);
}

/**
 * 모델이 여러 값을 한 필드에 뭉쳐 넣는 경우가 있다
 * (예: "+84 368 114 882 / +82 10-7494-1491"). 구분자로 쪼개 반환한다.
 *
 * 구분자는 슬래시·세미콜론·쉼표·줄바꿈만 쓴다. 하이픈은 번호 내부에 쓰이고,
 * 공백은 "+84 368 114 882" 처럼 한 번호 안에서도 나오므로 제외한다.
 */
export function splitMultiValue(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(/\s*(?:\/|;|,|\n)\s*/)
    .map((v) => v.trim())
    .filter(Boolean);
}
