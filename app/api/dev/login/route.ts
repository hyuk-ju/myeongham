import { NextResponse } from "next/server";

/**
 * 개발 전용 자동 로그인.
 *
 * Clerk 의 sign-in token 을 발급받아 `/sign-in?__clerk_ticket=...` 으로 넘긴다.
 * `<SignIn />` 이 티켓을 보고 스스로 세션을 만들기 때문에 비밀번호도, 소셜
 * 로그인 클릭도 필요 없다. 만들어지는 세션은 평소 로그인과 완전히 같아서
 * Supabase RLS(`auth.jwt()->>'sub'`) 도 그대로 동작한다.
 *
 * 브라우저로 테스트할 때 `/api/dev/login` 한 번만 열면 로그인된 상태가 된다.
 *
 * 세 겹으로 잠가둔다 — 하나라도 어긋나면 404 다.
 *   1. 프로덕션 빌드에서는 무조건 차단
 *   2. CLERK_SECRET_KEY 가 sk_test_ (개발 인스턴스) 일 때만
 *   3. DEV_LOGIN_USER_ID 를 .env.local 에 직접 넣었을 때만
 */
export async function GET(request: Request) {
  const notFound = new NextResponse("Not found", { status: 404 });

  if (process.env.NODE_ENV === "production") return notFound;

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey?.startsWith("sk_test_")) return notFound;

  const userId = process.env.DEV_LOGIN_USER_ID;
  if (!userId) {
    return new NextResponse(
      "DEV_LOGIN_USER_ID 가 .env.local 에 없습니다. 로그인할 Clerk 사용자 ID 를 넣고 dev 서버를 다시 시작하세요.",
      { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  const response = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: {
      authorization: `Bearer ${secretKey}`,
      "content-type": "application/json",
    },
    // 티켓은 한 번 쓰면 소멸한다. 짧게 잡아도 충분하다.
    body: JSON.stringify({ user_id: userId, expires_in_seconds: 120 }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return new NextResponse(`Clerk sign-in token 발급 실패 (${response.status})\n${detail}`, {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const { token } = (await response.json()) as { token: string };

  const target = new URL("/sign-in", request.url);
  target.searchParams.set("__clerk_ticket", token);
  // 티켓이 URL 에 남지 않도록 브라우저가 캐시하지 못하게 한다.
  return NextResponse.redirect(target, {
    headers: { "cache-control": "no-store" },
  });
}
