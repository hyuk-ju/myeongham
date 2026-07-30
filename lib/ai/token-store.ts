/**
 * OAuth 토큰 저장/갱신 — 다중 제공자(ChatGPT / Claude) 지원.
 *
 * 사용자당 제공자별 1행이며 그중 하나만 is_active. AI 호출은 활성 행을 쓴다.
 *
 * 서버리스에서는 여러 인스턴스가 동시에 "토큰 만료" 를 감지할 수 있다.
 * refresh token 은 rotation 될 수 있어 이중 갱신 시 한쪽이 무효화되므로,
 * ai_tokens.refresh_started_at 컬럼을 CAS 락으로 사용해 갱신을 직렬화한다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshTokenSet, type TokenSet } from "@/lib/ai/openai-oauth";
import { refreshClaudeTokenSet } from "@/lib/ai/anthropic-oauth";
import type { OAuthAIProvider } from "@/lib/ai/provider-types";

const REFRESH_MARGIN_MS = 60_000; // 만료 60초 전부터 갱신
const STALE_LOCK_MS = 30_000; // 30초 넘게 잡혀 있는 락은 죽은 것으로 간주
const WAIT_POLL_MS = 700;
const WAIT_MAX_MS = 15_000;

export type AIProvider = OAuthAIProvider;

export interface TokenRow {
  owner_id: string;
  provider: AIProvider;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  chatgpt_account_id: string | null;
  refresh_started_at: string | null;
  is_active: boolean;
}

export interface ActiveToken {
  provider: AIProvider;
  accessToken: string;
  /** 제공자 공용 계정 ID (ChatGPT account id 또는 Claude 계정 이메일) */
  accountId: string | null;
}

function refreshFor(provider: AIProvider, refreshToken: string): Promise<TokenSet> {
  return provider === "anthropic-claude"
    ? refreshClaudeTokenSet(refreshToken)
    : refreshTokenSet(refreshToken);
}

/** 저장하면서 해당 제공자를 활성으로 만든다 (다른 제공자는 비활성화). */
export async function saveTokenSet(
  supabase: SupabaseClient,
  ownerId: string,
  provider: AIProvider,
  tokens: TokenSet,
): Promise<void> {
  // 부분 유니크 인덱스(owner_id where is_active) 위반을 피하려면
  // 반드시 비활성화를 먼저 한다.
  const { error: deactivateError } = await supabase
    .from("ai_tokens")
    .update({ is_active: false })
    .eq("owner_id", ownerId)
    .neq("provider", provider);
  if (deactivateError) throw new Error(`토큰 저장 실패: ${deactivateError.message}`);

  const { error } = await supabase.from("ai_tokens").upsert(
    {
      owner_id: ownerId,
      provider,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: new Date(tokens.expiresAt).toISOString(),
      chatgpt_account_id: tokens.chatgptAccountId,
      refresh_started_at: null,
      is_active: true,
    },
    { onConflict: "owner_id,provider" },
  );
  if (error) throw new Error(`토큰 저장 실패: ${error.message}`);
}

export async function getTokenRows(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<TokenRow[]> {
  const { data, error } = await supabase
    .from("ai_tokens")
    .select("*")
    .eq("owner_id", ownerId)
    .order("provider");
  if (error) throw new Error(`토큰 조회 실패: ${error.message}`);
  return (data ?? []) as TokenRow[];
}

export async function getActiveTokenRow(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<TokenRow | null> {
  const { data, error } = await supabase
    .from("ai_tokens")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(`토큰 조회 실패: ${error.message}`);
  return data as TokenRow | null;
}

export async function deleteToken(
  supabase: SupabaseClient,
  ownerId: string,
  provider: AIProvider,
): Promise<void> {
  await supabase.from("ai_tokens").delete().eq("owner_id", ownerId).eq("provider", provider);

  // 활성 제공자를 지웠다면 남은 제공자를 활성으로 승격한다.
  const rows = await getTokenRows(supabase, ownerId);
  if (rows.length && !rows.some((r) => r.is_active)) {
    await supabase
      .from("ai_tokens")
      .update({ is_active: true })
      .eq("owner_id", ownerId)
      .eq("provider", rows[0].provider);
  }
}

export async function setActiveProvider(
  supabase: SupabaseClient,
  ownerId: string,
  provider: AIProvider,
): Promise<void> {
  const rows = await getTokenRows(supabase, ownerId);
  if (!rows.some((r) => r.provider === provider)) {
    throw new Error("해당 제공자가 연결되어 있지 않습니다.");
  }
  const { error: offError } = await supabase
    .from("ai_tokens")
    .update({ is_active: false })
    .eq("owner_id", ownerId);
  if (offError) throw new Error(`전환 실패: ${offError.message}`);

  const { error: onError } = await supabase
    .from("ai_tokens")
    .update({ is_active: true })
    .eq("owner_id", ownerId)
    .eq("provider", provider);
  if (onError) throw new Error(`전환 실패: ${onError.message}`);
}

function isFresh(row: TokenRow): boolean {
  return new Date(row.expires_at).getTime() - Date.now() > REFRESH_MARGIN_MS;
}

function toActive(row: TokenRow): ActiveToken {
  return {
    provider: row.provider,
    accessToken: row.access_token,
    accountId: row.chatgpt_account_id,
  };
}

/**
 * 유효한 access token 을 반환한다. preferred 제공자가 지정되면 반드시 그것을,
 * 아니면 활성 제공자를 쓴다. 만료가 임박했으면 갱신하되, CAS 락을 딴
 * 인스턴스만 실제 갱신을 수행하고 나머지는 결과를 대기한다.
 */
export async function getValidToken(
  supabase: SupabaseClient,
  ownerId: string,
  preferred?: AIProvider,
): Promise<ActiveToken> {
  const rows = await getTokenRows(supabase, ownerId);
  if (!rows.length) {
    throw new Error(
      "AI 계정이 연결되어 있지 않습니다. 설정 화면에서 먼저 연결하세요.",
    );
  }
  const preferredRow = preferred ? rows.find((r) => r.provider === preferred) : null;
  if (preferred && !preferredRow) {
    throw new Error("선택한 AI 제공자가 연결되어 있지 않습니다.");
  }
  const row = preferredRow ?? rows.find((r) => r.is_active) ?? rows[0];
  if (isFresh(row)) return toActive(row);

  // --- CAS: 락 선점 시도 -----------------------------------------------
  const staleBefore = new Date(Date.now() - STALE_LOCK_MS).toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("ai_tokens")
    .update({ refresh_started_at: new Date().toISOString() })
    .eq("owner_id", ownerId)
    .eq("provider", row.provider)
    .or(`refresh_started_at.is.null,refresh_started_at.lt.${staleBefore}`)
    .select("refresh_token")
    .maybeSingle();
  if (claimError) throw new Error(`토큰 갱신 락 실패: ${claimError.message}`);

  if (claimed) {
    // 락을 땄다 → 우리가 갱신한다.
    try {
      const fresh = await refreshFor(row.provider, claimed.refresh_token);
      // 갱신 응답에 계정 정보가 없는 제공자(Claude)는 기존 값을 보존한다.
      if (!fresh.chatgptAccountId) fresh.chatgptAccountId = row.chatgpt_account_id;
      await saveTokenSet(supabase, ownerId, row.provider, fresh);
      return { provider: row.provider, accessToken: fresh.accessToken, accountId: fresh.chatgptAccountId };
    } catch (err) {
      // 실패 시 락을 풀어 다른 인스턴스가 재시도할 수 있게 한다.
      await supabase
        .from("ai_tokens")
        .update({ refresh_started_at: null })
        .eq("owner_id", ownerId)
        .eq("provider", row.provider);
      throw err;
    }
  }

  // --- 다른 인스턴스가 갱신 중 → 완료를 폴링 ----------------------------
  const deadline = Date.now() + WAIT_MAX_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, WAIT_POLL_MS));
    const latest = (await getTokenRows(supabase, ownerId)).find(
      (r) => r.provider === row.provider,
    );
    if (latest && isFresh(latest)) return toActive(latest);
  }
  throw new Error("토큰 갱신 대기 시간 초과 — 잠시 후 다시 시도하세요.");
}
