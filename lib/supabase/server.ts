import { auth } from "@clerk/nextjs/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

/**
 * 서버용 Supabase 클라이언트 (Server Component / Route Handler / Server Action).
 *
 * 인증은 Clerk 이 담당한다. Clerk 세션 토큰을 accessToken 으로 넘기면
 * Supabase 가 Third-Party Auth 로 검증하고, RLS 의 auth.jwt()->>'sub' 에
 * Clerk 사용자 ID 가 들어온다.
 *
 * 요청마다 새로 만들어야 하며, 모듈 스코프에 캐싱하면 세션이 섞인다.
 */
export function createClient() {
  return createSupabaseClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    async accessToken() {
      return (await auth()).getToken();
    },
  });
}
