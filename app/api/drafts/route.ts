import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { getAuthorizedUser } from "@/lib/auth";
import { DRAFT_COLUMNS, withImageUrlsResult } from "@/lib/drafts";
import {
  errorResponse,
  jsonResponse,
  parseDraftRecord,
  parseDraftRecords,
  parseDraftUploadRequest,
} from "@/lib/http-contracts";

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
  if (!auth) return errorResponse("unauthorized");
  const { user, supabase } = auth;

  const upload = await parseDraftUploadRequest(request);
  if (!upload.ok) return errorResponse(upload.code);

  const imagePath = `${user.id}/${randomUUID()}.${upload.value.extension}`;

  const { error: uploadError } = await supabase.storage
    .from("card-images")
    .upload(imagePath, upload.value.bytes, { contentType: upload.value.contentType, upsert: false });
  if (uploadError) {
    return errorResponse("invalid_response");
  }

  const { data, error } = await supabase
    .from("card_drafts")
    .insert({ owner_id: user.id, image_path: imagePath })
    .select(DRAFT_COLUMNS)
    .single();

  if (error) {
    // 행을 못 만들면 방금 올린 이미지는 고아가 된다. 바로 치운다.
    await supabase.storage.from("card-images").remove([imagePath]);
    return errorResponse("invalid_response");
  }

  // 방금 만든 행 하나뿐이라 구제 대상이 없다 — 엄격하게 판정한다.
  const record = parseDraftRecord(data);
  if (!record.ok) return errorResponse(record.code);
  const rows = await withImageUrlsResult(supabase, [record.value]);
  if (!rows.ok) return errorResponse(rows.code);
  const row = rows.value[0];
  if (row === undefined) return errorResponse("invalid_response");
  return jsonResponse(row, 201);
}

/** 내 대기열 전체. 앱을 다시 열었을 때 이어서 처리하기 위한 것이다. */
export async function GET() {
  const auth = await getAuthorizedUser();
  if (!auth) return errorResponse("unauthorized");

  const { data, error } = await auth.supabase
    .from("card_drafts")
    .select(DRAFT_COLUMNS)
    .order("created_at", { ascending: true });

  if (error) return errorResponse("invalid_response");
  const records = parseDraftRecords(data ?? []);
  if (!records.ok) return errorResponse(records.code);
  const rows = await withImageUrlsResult(auth.supabase, records.value);
  if (!rows.ok) return errorResponse(rows.code);
  return jsonResponse({ drafts: rows.value });
}
