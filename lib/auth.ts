import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isEmailAllowed } from "@/lib/env";

export interface AuthedUser {
  /** Clerk 사용자 ID — cards.owner_id 에 그대로 들어간다 */
  id: string;
  email: string | null;
}

/**
 * 로그인 + allowlist 를 모두 통과한 사용자를 반환한다.
 *
 * proxy.ts 의 clerkMiddleware 가 1차로 막지만, 데이터에 접근하는 모든 지점에서
 * 이 함수를 다시 호출한다. 이중 검사는 의도된 것이다.
 */
export async function requireUser(): Promise<{
  user: AuthedUser;
  supabase: SupabaseClient;
}> {
  const resolved = await resolveUser();
  if (!resolved) redirect("/sign-in");
  if (!isEmailAllowed(resolved.user.email)) redirect("/sign-in?error=not_allowed");

  return resolved;
}

/** Route Handler 용 — 리다이렉트 대신 null 을 반환해 401 을 만들 수 있게 한다. */
export async function getAuthorizedUser(): Promise<{
  user: AuthedUser;
  supabase: SupabaseClient;
} | null> {
  const resolved = await resolveUser();
  if (!resolved || !isEmailAllowed(resolved.user.email)) return null;
  return resolved;
}

async function resolveUser(): Promise<{
  user: AuthedUser;
  supabase: SupabaseClient;
} | null> {
  const { userId } = await auth();
  if (!userId) return null;

  // 이메일은 allowlist 검사에만 쓴다. Clerk 쪽 조회가 실패하면
  // 통과시키지 않고 그대로 거부한다.
  const clerkUser = await currentUser();
  const email = clerkUser?.primaryEmailAddress?.emailAddress ?? null;

  return {
    user: { id: userId, email },
    supabase: createClient(),
  };
}
