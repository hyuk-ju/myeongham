/**
 * 환경변수 접근 지점.
 *
 * 값이 없을 때 곧바로 명확한 에러를 던진다. 이렇게 하지 않으면 Supabase/OpenAI
 * SDK 안쪽에서 "Invalid URL" 같은 원인을 알기 어려운 에러로 터진다.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `환경변수 ${name} 가 설정되지 않았습니다. .env.local 을 확인하세요 (SETUP.md 참고).`,
    );
  }
  return value;
}

/** 브라우저에 노출되는 값. NEXT_PUBLIC_ 접두사가 붙은 것만. */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
};

/** 서버 전용. 절대 클라이언트 컴포넌트에서 import 하지 말 것. */
export const serverEnv = {
  get openaiApiKey() {
    return required("OPENAI_API_KEY");
  },
  /**
   * 로그인 허용 이메일. 쉼표로 여러 개 지정 가능.
   * 비워두면 "누구나 로그인 가능"이 되어버리므로 필수로 둔다.
   */
  get allowedEmails(): string[] {
    return required("ALLOWED_EMAILS")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  },
};

export function isEmailAllowed(email: string | undefined | null): boolean {
  if (!email) return false;
  return serverEnv.allowedEmails.includes(email.toLowerCase());
}
