import { NextResponse, type NextRequest } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { setActiveProvider, type AIProvider } from "@/lib/ai/token-store";

const PROVIDERS: AIProvider[] = ["openai-codex", "anthropic-claude"];

/** 연결된 제공자 중 어떤 것으로 AI 를 호출할지 전환한다. */
export async function POST(request: NextRequest) {
  const auth = await getAuthorizedUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { provider } = (await request.json()) as { provider?: string };
  if (!PROVIDERS.includes(provider as AIProvider)) {
    return NextResponse.json({ error: "알 수 없는 제공자입니다." }, { status: 400 });
  }

  try {
    await setActiveProvider(auth.supabase, auth.user.id, provider as AIProvider);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "전환에 실패했습니다." },
      { status: 400 },
    );
  }
}
