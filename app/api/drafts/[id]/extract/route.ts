import { NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { extractCardFromImage } from "@/lib/ai/extract";
import { DRAFT_COLUMNS, withImageUrlsResult } from "@/lib/drafts";
import { errorResponse } from "@/lib/http-contracts";
import { validateDownloadedImage } from "@/lib/image-signature";

export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };
type RpcRow = {
  readonly code: string;
  readonly draftId: string | null;
  readonly processingToken: string | null;
  readonly status: string | null;
  readonly attempts: number | null;
};

function shouldStopQueue(message: string): boolean {
  return message.includes("사용량 한도") || message.includes("인증이 만료");
}

export async function POST(_request: Request, { params }: Params) {
  const auth = await getAuthorizedUser();
  if (!auth) return errorResponse("unauthorized");
  const { user, supabase } = auth;
  const { id } = await params;

  const claim = await supabase.rpc("claim_card_draft", { p_draft_id: id });
  if (claim.error) return NextResponse.json({ error: "invalid_response" }, { status: 500 });
  const claimRow = parseRpcRow(claim.data);
  if (!claimRow) return NextResponse.json({ error: "invalid_response" }, { status: 500 });

  if (claimRow.code === "not_found") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (claimRow.code === "busy") {
    return NextResponse.json({ error: "busy", code: "busy" }, { status: 409 });
  }
  if (claimRow.code === "already_extracted") {
    return draftResponse(supabase, id);
  }
  if (claimRow.code !== "claimed" || claimRow.processingToken === null) {
    return NextResponse.json({ error: claimRow.code }, { status: 500 });
  }

  const token = claimRow.processingToken;
  const { data: draft, error: draftError } = await supabase
    .from("card_drafts")
    .select("id, image_path")
    .eq("id", id)
    .maybeSingle();
  if (draftError || !isRecord(draft) || typeof draft.image_path !== "string") {
    await failClaim(supabase, id, token, "invalid_response");
    return NextResponse.json({ error: "invalid_response" }, { status: 500 });
  }

  const { data: blob, error: downloadError } = await supabase.storage
    .from("card-images")
    .download(draft.image_path);
  if (downloadError || !blob) {
    const message = `이미지를 불러오지 못했습니다: ${downloadError?.message ?? "unknown"}`;
    const failed = await failClaim(supabase, id, token, message);
    if (failed === "stale_token") return staleResponse();
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const image = validateDownloadedImage(
    draft.image_path,
    new Uint8Array(await blob.arrayBuffer()),
    blob.type,
  );
  if (!image.ok) {
    const failed = await failClaim(supabase, id, token, image.code);
    if (failed === "stale_token") return staleResponse();
    return errorResponse(image.code);
  }

  try {
    const base64 = Buffer.from(image.value.bytes).toString("base64");
    const card = await extractCardFromImage(
      supabase,
      user.id,
      `data:${image.value.contentType};base64,${base64}`,
    );
    const completed = await supabase.rpc("complete_card_draft_extraction", {
      p_draft_id: id,
      p_processing_token: token,
      p_extracted: card,
    });
    const completeRow = parseRpcRow(completed.data);
    if (completed.error || !completeRow) {
      return NextResponse.json({ error: "invalid_response" }, { status: 500 });
    }
    if (completeRow.code === "stale_token") return staleResponse();
    if (completeRow.code !== "completed") {
      return NextResponse.json({ error: completeRow.code }, { status: 500 });
    }
    return draftResponse(supabase, id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "분석에 실패했습니다.";
    const failed = await failClaim(supabase, id, token, message);
    if (failed === "stale_token") return staleResponse();
    const draftResponseValue = await draftResponsePayload(supabase, id);
    return NextResponse.json(
      {
        error: message,
        stopQueue: shouldStopQueue(message),
        draft: draftResponseValue,
      },
      { status: 502 },
    );
  }
}

async function draftResponse(supabase: Parameters<typeof withImageUrlsResult>[0], id: string) {
  const row = await draftResponsePayload(supabase, id);
  return row === null
    ? NextResponse.json({ error: "not_found" }, { status: 404 })
    : NextResponse.json(row);
}

async function draftResponsePayload(
  supabase: Parameters<typeof withImageUrlsResult>[0],
  id: string,
) {
  const { data, error } = await supabase
    .from("card_drafts")
    .select(DRAFT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const rows = await withImageUrlsResult(supabase, [data]);
  return rows.ok ? (rows.value[0] ?? null) : null;
}

async function failClaim(
  supabase: Parameters<typeof withImageUrlsResult>[0],
  id: string,
  token: string,
  message: string,
): Promise<string | null> {
  const result = await supabase.rpc("fail_card_draft_extraction", {
    p_draft_id: id,
    p_processing_token: token,
    p_error: message,
  });
  if (result.error) return null;
  const row = parseRpcRow(result.data);
  return row?.code ?? null;
}

function staleResponse() {
  return NextResponse.json({ error: "stale_token", code: "stale_token" }, { status: 409 });
}

function parseRpcRow(value: unknown): RpcRow | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!isRecord(row) || typeof row.code !== "string") return null;
  return {
    code: row.code,
    draftId: typeof row.draft_id === "string" ? row.draft_id : null,
    processingToken: typeof row.processing_token === "string" ? row.processing_token : null,
    status: typeof row.status === "string" ? row.status : null,
    attempts: typeof row.attempts === "number" ? row.attempts : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
