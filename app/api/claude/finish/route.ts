import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getAuthorizedUser } from "@/lib/auth";
import { exchangeClaudeCode, parseClaudeCodeInput } from "@/lib/ai/anthropic-oauth";
import { saveTokenSet } from "@/lib/ai/token-store";

const VERIFIER_COOKIE = "claude_pkce";

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const jar = await cookies();
  const stored = jar.get(VERIFIER_COOKIE)?.value;
  if (!stored) {
    return NextResponse.json(
      { error: "인증 세션이 만료되었습니다. '연결 시작'부터 다시 하세요." },
      { status: 400 },
    );
  }

  let verifier: string;
  let expectedState: string;
  try {
    const parsed = JSON.parse(stored) as { v: string; s: string };
    verifier = parsed.v;
    expectedState = parsed.s;
  } catch {
    return NextResponse.json({ error: "인증 세션이 손상되었습니다." }, { status: 400 });
  }

  const { code: pasted } = (await request.json()) as { code?: string };
  if (!pasted?.trim()) {
    return NextResponse.json({ error: "붙여넣은 값이 비어 있습니다." }, { status: 400 });
  }

  try {
    const { code, state } = parseClaudeCodeInput(pasted);

    // CSRF 방어: 코드에 state 가 붙어 온 경우 일치해야 한다.
    if (state && state !== expectedState) {
      return NextResponse.json(
        { error: "state 불일치 — 다른 인증 세션의 코드인 것 같습니다." },
        { status: 400 },
      );
    }

    const tokens = await exchangeClaudeCode(code, state ?? expectedState, verifier);
    await saveTokenSet(auth.supabase, auth.user.id, "anthropic-claude", tokens);
    jar.delete(VERIFIER_COOKIE);

    return NextResponse.json({
      ok: true,
      accountId: tokens.chatgptAccountId,
      expiresAt: tokens.expiresAt,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "연결에 실패했습니다." },
      { status: 400 },
    );
  }
}
