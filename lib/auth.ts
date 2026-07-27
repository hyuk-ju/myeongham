import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isUserAllowed } from "@/lib/env";

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
  // 허용 목록 밖이면 본인 식별자를 보여주는 안내 화면으로 보낸다.
  // (Apple 이메일 가리기 때문에 이메일만으로는 등록이 어려울 수 있다)
  if (!isUserAllowed(resolved.user.email, resolved.user.id)) redirect("/not-allowed");

  return resolved;
}

/** Route Handler 용 — 리다이렉트 대신 null 을 반환해 401 을 만들 수 있게 한다. */
export async function getAuthorizedUser(): Promise<{
  user: AuthedUser;
  supabase: SupabaseClient;
} | null> {
  const resolved = await resolveUser();
  if (!resolved || !isUserAllowed(resolved.user.email, resolved.user.id)) return null;
  return resolved;
}

/** 로그인 여부만 확인한다 (허용 목록 검사 없음) — /not-allowed 화면 전용. */
export async function getSignedInUser(): Promise<AuthedUser | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const clerkUser = await currentUser();
  return {
    id: userId,
    email: clerkUser?.primaryEmailAddress?.emailAddress ?? null,
  };
}

async function resolveUser(): Promise<{
  user: AuthedUser;
  supabase: SupabaseClient;
} | null> {
  const user = await getSignedInUser();
  if (!user) return null;
  return { user, supabase: createClient() };
}
