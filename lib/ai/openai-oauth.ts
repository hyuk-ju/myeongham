/**
 * ChatGPT 구독 OAuth (Codex OAuth) — PKCE 흐름.
 *
 * OpenAI가 외부 도구에서의 구독 OAuth 사용을 명시적으로 허용하는 경로다
 * (OpenClaw, Aside 등이 동일 방식 사용).
 *
 * 이 client_id 의 redirect_uri 는 localhost:1455 로 고정되어 있다.
 * 호스팅된 웹앱에서는 콜백을 직접 받을 수 없으므로, 로그인 후 브라우저
 * 주소창에 뜨는 localhost URL 전체를 사용자가 복사해 붙여넣는 방식
 * (OpenClaw 의 헤드리스 흐름과 동일)으로 코드를 회수한다. 최초 1회만 필요.
 */
import { createHash, randomBytes } from "node:crypto";

export const OAUTH = {
  clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
  authorizeUrl: "https://auth.openai.com/oauth/authorize",
  tokenUrl: "https://auth.openai.com/oauth/token",
  redirectUri: "http://localhost:1455/auth/callback",
  scope: "openid profile email offline_access",
} as const;

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface PkcePair {
  verifier: string;
  challenge: string;
  state: string;
}

export function generatePkce(): PkcePair {
  const verifier = base64url(randomBytes(64));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const state = base64url(randomBytes(24));
  return { verifier, challenge, state };
}

export function buildAuthorizeUrl(pkce: PkcePair): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: OAUTH.clientId,
    redirect_uri: OAUTH.redirectUri,
    scope: OAUTH.scope,
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
    state: pkce.state,
    // OpenAI 전용 파라미터 (Codex CLI 와 동일)
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    originator: "codex_cli_rs",
  });
  return `${OAUTH.authorizeUrl}?${params.toString()}`;
}

/** 사용자가 붙여넣은 localhost 콜백 URL(또는 코드 자체)에서 code/state 추출 */
export function parseCallbackInput(input: string): { code: string; state: string | null } {
  const trimmed = input.trim();
  if (trimmed.includes("://") || trimmed.startsWith("localhost")) {
    const url = new URL(trimmed.includes("://") ? trimmed : `http://${trimmed}`);
    const code = url.searchParams.get("code");
    if (!code) throw new Error("붙여넣은 URL에 code 파라미터가 없습니다.");
    return { code, state: url.searchParams.get("state") };
  }
  // code 값만 붙여넣은 경우
  return { code: trimmed, state: null };
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  /** epoch ms */
  expiresAt: number;
  chatgptAccountId: string | null;
}

interface RawTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  id_token?: string;
}

/** JWT payload 를 검증 없이 디코드 (계정 ID 추출용 — 신뢰 경계는 OpenAI 쪽) */
function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const payload = jwt.split(".")[1];
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function extractAccountId(accessToken: string, idToken?: string): string | null {
  for (const token of [accessToken, idToken]) {
    if (!token) continue;
    const payload = decodeJwtPayload(token);
    if (!payload) continue;
    const auth = payload["https://api.openai.com/auth"] as
      | { chatgpt_account_id?: string }
      | undefined;
    if (auth?.chatgpt_account_id) return auth.chatgpt_account_id;
    if (typeof payload.chatgpt_account_id === "string") return payload.chatgpt_account_id;
  }
  return null;
}

async function requestToken(body: URLSearchParams): Promise<TokenSet> {
  const res = await fetch(OAUTH.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`토큰 요청 실패 (${res.status}): ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as RawTokenResponse;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
    chatgptAccountId: extractAccountId(json.access_token, json.id_token),
  };
}

export function exchangeCode(code: string, verifier: string): Promise<TokenSet> {
  return requestToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: OAUTH.clientId,
      redirect_uri: OAUTH.redirectUri,
      code,
      code_verifier: verifier,
    }),
  );
}

export function refreshTokenSet(refreshToken: string): Promise<TokenSet> {
  return requestToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: OAUTH.clientId,
      refresh_token: refreshToken,
      scope: OAUTH.scope,
    }),
  );
}
