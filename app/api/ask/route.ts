import { NextResponse, type NextRequest } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { askCards } from "@/lib/ai/ask";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { user, supabase } = auth;

  const { question } = (await request.json()) as { question?: string };
  if (!question?.trim()) {
    return NextResponse.json({ error: "질문을 입력하세요." }, { status: 400 });
  }
  if (question.length > 500) {
    return NextResponse.json({ error: "질문이 너무 깁니다 (500자 이하)." }, { status: 400 });
  }

  try {
    const result = await askCards(supabase, user.id, question.trim());
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "질의에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
