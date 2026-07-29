import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { getAuthorizedUser } from "@/lib/auth";
import { DRAFT_COLUMNS, withImageUrls } from "@/lib/drafts";

const MAX_BYTES = 6 * 1024 * 1024; // 클라이언트에서 리사이즈하므로 넉넉한 상한

/**
 * 사진을 대기열에 담는다 — Storage 업로드 + pending 행 생성까지만.
 *
 * **AI 를 부르지 않는다.** 이게 이 라우트의 존재 이유다. 예전 /api/extract 는
 * 업로드와 추출이 한 요청이라 한 장당 10~30초 동안 화면이 묶였다. 분석은
 * /api/drafts/[id]/extract 가 따로 맡아서, 사용자는 기다리지 않고 다음 장을
 * 계속 찍을 수 있다.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthorizedUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { user, supabase } = auth;

  const form = await request.formData();
  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "이미지가 없습니다." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "이미지가 너무 큽니다." }, { status: 413 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "image/jpeg";
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const imagePath = `${user.id}/${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("card-images")
    .upload(imagePath, bytes, { contentType: mime, upsert: false });
  if (uploadError) {
    return NextResponse.json(
      { error: `이미지 저장 실패: ${uploadError.message}` },
      { status: 500 },
    );
  }

  const { data, error } = await supabase
    .from("card_drafts")
    .insert({ owner_id: user.id, image_path: imagePath, status: "pending" })
    .select(DRAFT_COLUMNS)
    .single();

  if (error) {
    // 행을 못 만들면 방금 올린 이미지는 고아가 된다. 바로 치운다.
    await supabase.storage.from("card-images").remove([imagePath]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const [row] = await withImageUrls(supabase, [data]);
  return NextResponse.json(row, { status: 201 });
}

/** 내 대기열 전체. 앱을 다시 열었을 때 이어서 처리하기 위한 것이다. */
export async function GET() {
  const auth = await getAuthorizedUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await auth.supabase
    .from("card_drafts")
    .select(DRAFT_COLUMNS)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ drafts: await withImageUrls(auth.supabase, data ?? []) });
}
