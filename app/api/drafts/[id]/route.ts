import { NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

/**
 * 대기열에서 버린다 — 행과 사진을 함께 지운다.
 *
 * 검토를 마치고 명함으로 저장한 뒤에도 호출된다. 그때는 이미지가 cards 로
 * 넘어간 상태이므로 Storage 는 건드리면 안 된다 (`keep_image=1`).
 */
export async function DELETE(request: Request, { params }: Params) {
  const auth = await getAuthorizedUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { supabase } = auth;
  const { id } = await params;

  const keepImage = new URL(request.url).searchParams.get("keep_image") === "1";

  const { data: draft } = await supabase
    .from("card_drafts")
    .select("image_path")
    .eq("id", id)
    .maybeSingle();

  if (!draft) {
    return NextResponse.json({ error: "대기 중인 사진을 찾을 수 없습니다." }, { status: 404 });
  }

  const { error } = await supabase.from("card_drafts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Storage 삭제 실패는 치명적이지 않으므로 (고아 파일만 남음) 무시한다.
  if (!keepImage) {
    await supabase.storage.from("card-images").remove([draft.image_path as string]);
  }

  return NextResponse.json({ ok: true });
}
