import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Next.js 16 에서 middleware 는 proxy 로 이름이 바뀌었다.
 * 파일명만 다를 뿐 clerkMiddleware 사용법은 동일하다.
 *
 * 여기서는 "로그인 여부" 만 본다. 이메일 allowlist 검사는 데이터에 접근하는
 * 각 지점(requireUser / getAuthorizedUser)에서 다시 한다 — Server Function
 * 호출이 proxy matcher 를 우회할 수 있기 때문이다.
 */
const publicRoutes = ["/sign-in(.*)", "/sign-up(.*)"];

// 개발 전용 자동 로그인(/api/dev/login) 은 로그인 전에 열려야 한다.
// 프로덕션 빌드에서는 아예 목록에 넣지 않는다 — 라우트 자체도 404 를 반환한다.
if (process.env.NODE_ENV !== "production") publicRoutes.push("/api/dev/(.*)");

const isPublicRoute = createRouteMatcher(publicRoutes);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) await auth.protect();
});

export const config = {
  matcher: [
    // 정적 자산과 이미지 최적화 경로는 제외한다.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.svg|icons/|.*\\.(?:svg|png|jpg|jpeg|webp|gif|ico)$).*)",
    "/(api|trpc)(.*)",
    // Clerk 이 자체 핸들러를 붙이는 경로 — 반드시 포함해야 한다.
    "/__clerk/:path*",
  ],
};
