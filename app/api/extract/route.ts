import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { getAuthorizedUser } from "@/lib/auth";
import { extractCardFromImage } from "@/lib/ai/extract";

export const maxDuration = 120;

const MAX_BYTES = 6 * 1024 * 1024; // 클라이언트에서 리사이즈하므로 넉넉한 상한

/**
 * 명함 이미지 업로드 → Storage 저장 → AI 추출.
 * DB insert 는 하지 않는다. 사용자가 확인·수정한 뒤 저장하는 것이 원칙이라
 * 추출 결과만 돌려준다.
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

  // 1) 원본 저장 — 추출이 실패해도 이미지는 남겨서 수동 입력이 가능하게 한다.
  const { error: uploadError } = await supabase.storage
    .from("card-images")
    .upload(imagePath, bytes, { contentType: mime, upsert: false });
  if (uploadError) {
    return NextResponse.json(
      { error: `이미지 저장 실패: ${uploadError.message}` },
      { status: 500 },
    );
  }

  // 2) AI 추출
  const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;
  try {
    const card = await extractCardFromImage(supabase, user.id, dataUrl);
    return NextResponse.json({ imagePath, card });
  } catch (err) {
    const message = err instanceof Error ? err.message : "분석에 실패했습니다.";
    // 이미지는 이미 올라갔으므로 경로를 함께 돌려준다 → 수동 입력으로 진행 가능
    return NextResponse.json({ imagePath, error: message }, { status: 502 });
  }
}
