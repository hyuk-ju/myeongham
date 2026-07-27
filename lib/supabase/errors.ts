/**
 * Supabase 가 Clerk 토큰을 아직 신뢰하지 않을 때 나는 오류를 알아본다.
 *
 * Third-Party Auth 에 Clerk 을 등록하지 않으면 Supabase 는 JWT 서명을 검증할
 * 키를 찾지 못해 "No suitable key or wrong key type" 을 돌려준다. 설정을 안 한
 * 상태와 진짜 장애를 구분해서 안내하기 위한 판별자다.
 */
export function isClerkNotLinkedError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return (
    message.includes("No suitable key") ||
    message.includes("wrong key type") ||
    message.includes("invalid JWT") ||
    message.includes("JWSError")
  );
}

export const CLERK_SETUP_HINT =
  "Supabase 에 Clerk 을 아직 연결하지 않았습니다. Supabase 대시보드 → Authentication → Third-Party Auth 에서 Clerk 을 추가하세요 (SETUP.md 2번).";
