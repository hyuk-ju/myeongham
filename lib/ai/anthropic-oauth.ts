/**
 * Claude 구독 OAuth (Claude Code OAuth) — PKCE 흐름.
 *
 * Claude Pro/Max 구독으로 API 과금 없이 추론을 쓰는 경로. OpenClaw 등
 * 외부 도구들이 쓰는 것과 동일한 클라이언트다.
 *
 * redirect_uri 가 console.anthropic.com 의 코드 표시 페이지로 고정되어 있어,
 * 로그인 후 화면에 표시되는 인증 코드("코드#state" 형태)를 사용자가 복사해
 * 붙여넣는 방식으로 회수한다. 최초 1회만 필요.
 */
import { createHash, randomBytes } from "node:crypto";
import type { TokenSet } from "@/lib/ai/openai-oauth";

export const CLAUDE_OAUTH = {
  clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
  authorizeUrl: "https://claude.ai/oauth/authorize",
  tokenUrl: "https://console.anthropic.com/v1/oauth/token",
  redirectUri: "https://console.anthropic.com/oauth/code/callback",
  scope: "org:create_api_key user:profile user:inference",
} as const;

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface ClaudePkce {
  verifier: string;
  challenge: string;
  state: string;
}

export function generateClaudePkce(): ClaudePkce {
  const verifier = base64url(randomBytes(64));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  // Claude 흐름에서는 state 로 verifier 를 재사용하는 구현이 많지만,
  // 여기서는 별도 난수를 쓴다 (코드 붙여넣기 시 #state 로 돌아온다).
  const state = base64url(randomBytes(24));
  return { verifier, challenge, state };
}

export function buildClaudeAuthorizeUrl(pkce: ClaudePkce): string {
  const params = new URLSearchParams({
    code: "true", // 콜백 대신 화면에 코드를 표시하는 수동 복사 모드
    client_id: CLAUDE_OAUTH.clientId,
    response_type: "code",
    redirect_uri: CLAUDE_OAUTH.redirectUri,
    scope: CLAUDE_OAUTH.scope,
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
    state: pkce.state,
  });
  return `${CLAUDE_OAUTH.authorizeUrl}?${params.toString()}`;
}

/**
 * 사용자가 붙여넣은 값에서 code/state 추출.
 * 정상 형태는 "코드#state" 이지만, URL 을 통째로 붙여넣는 실수도 흡수한다.
 */
export function parseClaudeCodeInput(input: string): { code: string; state: string | null } {
  let trimmed = input.trim();
  if (trimmed.includes("://")) {
    const url = new URL(trimmed);
    const fromQuery = url.searchParams.get("code");
    if (fromQuery) {
      return { code: fromQuery, state: url.searchParams.get("state") };
    }
    // 코드가 fragment 에 있는 경우
    trimmed = url.hash.replace(/^#/, "") || trimmed;
  }
  const [code, state] = trimmed.split("#");
  if (!code) throw new Error("붙여넣은 값에서 인증 코드를 찾지 못했습니다.");
  return { code: code.trim(), state: state?.trim() || null };
}

interface RawTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  account?: { uuid?: string; email_address?: string };
}

async function requestToken(body: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(CLAUDE_OAUTH.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Claude 토큰 요청 실패 (${res.status}): ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as RawTokenResponse;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
    // ai_tokens.chatgpt_account_id 컬럼을 제공자 공용 계정 ID 로 재사용한다.
    chatgptAccountId: json.account?.email_address ?? json.account?.uuid ?? null,
  };
}

export function exchangeClaudeCode(
  code: string,
  state: string,
  verifier: string,
): Promise<TokenSet> {
  return requestToken({
    grant_type: "authorization_code",
    code,
    state,
    client_id: CLAUDE_OAUTH.clientId,
    redirect_uri: CLAUDE_OAUTH.redirectUri,
    code_verifier: verifier,
  });
}

export function refreshClaudeTokenSet(refreshToken: string): Promise<TokenSet> {
  return requestToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: CLAUDE_OAUTH.clientId,
  });
}
