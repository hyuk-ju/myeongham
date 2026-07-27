import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getAuthorizedUser } from "@/lib/auth";
import { exchangeCode, parseCallbackInput } from "@/lib/ai/openai-oauth";
import { saveTokenSet } from "@/lib/ai/token-store";

const VERIFIER_COOKIE = "codex_pkce";

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

  const { callbackUrl } = (await request.json()) as { callbackUrl?: string };
  if (!callbackUrl?.trim()) {
    return NextResponse.json({ error: "붙여넣은 값이 비어 있습니다." }, { status: 400 });
  }

  try {
    const { code, state } = parseCallbackInput(callbackUrl);

    // CSRF 방어: URL 을 붙여넣은 경우 state 가 일치해야 한다.
    if (state && state !== expectedState) {
      return NextResponse.json(
        { error: "state 불일치 — 다른 인증 세션의 URL 인 것 같습니다." },
        { status: 400 },
      );
    }

    const tokens = await exchangeCode(code, verifier);
    await saveTokenSet(auth.supabase, auth.user.id, "openai-codex", tokens);
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
