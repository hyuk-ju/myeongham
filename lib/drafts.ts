import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractedCard } from "@/lib/ai/extract";
import type { EnrichSuggestion } from "@/lib/ai/enrich";

/** 대기열 한 건. AI 분석은 아직 안 돌았을 수도 있다. */
export interface DraftRow {
  id: string;
  image_path: string;
  status: "pending" | "extracted" | "failed";
  extracted: ExtractedCard | null;
  error: string | null;
  attempts: number;
  /** 미리 받아둔 회사 정보 제안. 적용은 사용자가 검토 화면에서 한다. */
  enrich: EnrichSuggestion | null;
  created_at: string;
  /** DB 컬럼이 아니라 API 가 붙여주는 서명 URL (1시간) */
  image_url: string | null;
}

export const DRAFT_COLUMNS =
  "id, image_path, status, extracted, error, attempts, enrich, created_at";

const SIGNED_URL_TTL = 3600;

type DraftRecord = Omit<DraftRow, "image_url">;

/**
 * 썸네일·검토 화면에서 쓸 서명 URL 을 붙인다.
 *
 * card-images 버킷은 비공개라 경로만으로는 못 읽는다. 한 건씩 서명하면 왕복이
 * 늘어나므로 목록은 createSignedUrls 로 한 번에 처리한다.
 */
export async function withImageUrls(
  supabase: SupabaseClient,
  rows: DraftRecord[],
): Promise<DraftRow[]> {
  if (!rows.length) return [];

  const { data } = await supabase.storage
    .from("card-images")
    .createSignedUrls(
      rows.map((r) => r.image_path),
      SIGNED_URL_TTL,
    );

  const byPath = new Map((data ?? []).map((s) => [s.path, s.signedUrl]));
  return rows.map((r) => ({ ...r, image_url: byPath.get(r.image_path) ?? null }));
}
