import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthorizedUser } from "@/lib/auth";
import { buildAuthorizeUrl, generatePkce } from "@/lib/ai/openai-oauth";

const VERIFIER_COOKIE = "codex_pkce";

export async function POST() {
  const auth = await getAuthorizedUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const pkce = generatePkce();

  // verifier 는 브라우저에 노출되면 안 되므로 httpOnly 쿠키에 보관한다.
  const jar = await cookies();
  jar.set(VERIFIER_COOKIE, JSON.stringify({ v: pkce.verifier, s: pkce.state }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 900, // 15분
  });

  return NextResponse.json({ authorizeUrl: buildAuthorizeUrl(pkce) });
}
