/**
 * 환경변수 접근 지점.
 *
 * 값이 없을 때 곧바로 명확한 에러를 던진다. 이렇게 하지 않으면 Supabase/OpenAI
 * SDK 안쪽에서 "Invalid URL" 같은 원인을 알기 어려운 에러로 터진다.
 */

function list(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

/** 브라우저에 노출되는 값. NEXT_PUBLIC_ 접두사가 붙은 것만. */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
};

/** 서버 전용. 절대 클라이언트 컴포넌트에서 import 하지 말 것. */
export const serverEnv = {
  get openaiApiKey() {
    return process.env.OPENAI_API_KEY?.trim() || null;
  },
  get openaiSearchModel() {
    return process.env.OPENAI_SEARCH_MODEL?.trim() || "gpt-5.6";
  },
  /** 로그인 허용 이메일. 쉼표로 여러 개. */
  get allowedEmails(): string[] {
    return list("ALLOWED_EMAILS").map((e) => e.toLowerCase());
  },
  /**
   * 로그인 허용 Clerk 사용자 ID. 쉼표로 여러 개.
   *
   * Apple 로그인은 "이메일 가리기" 를 켜면 실제 주소 대신
   * xxxx@privaterelay.appleid.com 이 넘어온다. 그 주소는 미리 알 수 없으므로
   * 이메일만으로는 허용 목록을 만들 수 없다. 그래서 사용자 ID 로도 허용한다.
   */
  get allowedUserIds(): string[] {
    return list("ALLOWED_USER_IDS");
  },
};

/**
 * 이 사람을 들여보낼지 판단한다. 이메일 또는 사용자 ID 중 하나만 맞으면 통과.
 *
 * 둘 다 비어 있으면 "아무나 통과" 가 되어버리므로 그때는 전부 거부한다 —
 * 설정 실수로 앱이 열리는 쪽보다 잠기는 쪽이 안전하다.
 */
export function isUserAllowed(
  email: string | undefined | null,
  userId: string | undefined | null,
): boolean {
  const emails = serverEnv.allowedEmails;
  const ids = serverEnv.allowedUserIds;
  if (!emails.length && !ids.length) return false;

  if (userId && ids.includes(userId)) return true;
  if (email && emails.includes(email.toLowerCase())) return true;
  return false;
}
