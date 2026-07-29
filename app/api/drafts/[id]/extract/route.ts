import { NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { extractCardFromImage } from "@/lib/ai/extract";
import { DRAFT_COLUMNS, withImageUrls } from "@/lib/drafts";

export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

/**
 * 이 실패가 나면 뒤이은 건도 전부 같은 이유로 실패한다 — 큐를 계속 돌릴 이유가 없다.
 *
 * AI 계층이 상태 코드를 그대로 던지지 않고 한국어 메시지로 바꿔버려서
 * (claude.ts / codex.ts) 문자열로 판별한다. 메시지를 고치면 여기도 같이 고쳐야 한다.
 */
function shouldStopQueue(message: string): boolean {
  return message.includes("사용량 한도") || message.includes("인증이 만료");
}

function mimeOf(path: string): string {
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

/**
 * 대기열의 사진 한 장을 AI 로 분석한다.
 *
 * 클라이언트 워커가 한 건씩(동시성 1) 부른다. 구독 OAuth 는 429 재시도 계층이
 * 없어서 동시에 부르면 한도만 빨리 태우기 때문이다.
 */
export async function POST(_request: Request, { params }: Params) {
  const auth = await getAuthorizedUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { user, supabase } = auth;
  const { id } = await params;

  const { data: draft } = await supabase
    .from("card_drafts")
    .select("id, image_path, attempts")
    .eq("id", id)
    .maybeSingle();

  if (!draft) {
    return NextResponse.json({ error: "대기 중인 사진을 찾을 수 없습니다." }, { status: 404 });
  }

  const attempts = (draft.attempts as number) + 1;

  const { data: blob, error: downloadError } = await supabase.storage
    .from("card-images")
    .download(draft.image_path as string);

  if (downloadError || !blob) {
    const message = `이미지를 불러오지 못했습니다: ${downloadError?.message ?? "unknown"}`;
    await supabase
      .from("card_drafts")
      .update({ status: "failed", error: message, attempts })
      .eq("id", id);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const mime = mimeOf(draft.image_path as string);
  const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");

  try {
    const card = await extractCardFromImage(supabase, user.id, `data:${mime};base64,${base64}`);
    const { data, error } = await supabase
      .from("card_drafts")
      .update({ status: "extracted", extracted: card, error: null, attempts })
      .eq("id", id)
      .select(DRAFT_COLUMNS)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const [row] = await withImageUrls(supabase, [data]);
    return NextResponse.json(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : "분석에 실패했습니다.";
    // 사진은 그대로 두고 failed 로만 표시한다 — 재시도하거나 직접 입력할 수 있다.
    const { data } = await supabase
      .from("card_drafts")
      .update({ status: "failed", error: message, attempts })
      .eq("id", id)
      .select(DRAFT_COLUMNS)
      .single();

    const [row] = data ? await withImageUrls(supabase, [data]) : [null];
    return NextResponse.json(
      { error: message, stopQueue: shouldStopQueue(message), draft: row },
      { status: 502 },
    );
  }
}
