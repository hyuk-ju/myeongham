import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseSignedUrls,
  type ContractResult,
  type DraftRecord,
  type DraftResponse,
} from "@/lib/http-contracts";

/** 대기열 한 건. AI 분석은 아직 안 돌았을 수도 있다. */
export type DraftRow = DraftResponse;

export const DRAFT_COLUMNS =
  "id, image_path, status, extracted, error, attempts, enrich, created_at";

const SIGNED_URL_TTL = 3600;

/**
 * 썸네일·검토 화면에서 쓸 서명 URL 을 붙인다.
 *
 * card-images 버킷은 비공개라 경로만으로는 못 읽는다. 한 건씩 서명하면 왕복이
 * 늘어나므로 목록은 createSignedUrls 로 한 번에 처리한다.
 */
export async function withImageUrls(
  supabase: SupabaseClient,
  rows: readonly DraftRecord[],
): Promise<readonly DraftRow[]> {
  const result = await withImageUrlsResult(supabase, rows);
  return result.ok ? result.value : [];
}

export async function withImageUrlsResult(
  supabase: SupabaseClient,
  rows: readonly DraftRecord[],
): Promise<ContractResult<readonly DraftRow[]>> {
  if (!rows.length) return { ok: true, value: [] };

  const { data, error } = await supabase.storage
    .from("card-images")
    .createSignedUrls(
      rows.map((r) => r.image_path),
      SIGNED_URL_TTL,
    );
  if (error) return { ok: false, code: "invalid_response" };

  const signed = parseSignedUrls(data ?? []);
  if (!signed.ok) return { ok: false, code: signed.code };
  const byPath = new Map(signed.value.map((entry) => [entry.path, entry.signedUrl]));
  return {
    ok: true,
    value: rows.map((row) => ({ ...row, image_url: byPath.get(row.image_path) ?? null })),
  };
}
