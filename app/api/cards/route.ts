import { NextResponse, type NextRequest } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { normalizePhoneOrNull } from "@/lib/phone";

const TEXT_FIELDS = [
  "name", "name_en", "title", "department", "company", "company_en",
  "email", "email2", "website", "address", "postal_code", "tax_code",
  "raw_text", "industry", "notes", "met_context",
] as const;

/** 국가번호 표기를 현지 표기로 정규화해서 저장하는 필드 */
const PHONE_FIELDS = ["phone", "mobile", "mobile2", "fax"] as const;

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { user, supabase } = auth;

  const body = (await request.json()) as Record<string, unknown>;

  if (typeof body.image_path !== "string" || !body.image_path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "잘못된 이미지 경로입니다." }, { status: 400 });
  }

  const row: Record<string, unknown> = {
    owner_id: user.id,
    image_path: body.image_path,
    status: "confirmed",
  };

  for (const key of TEXT_FIELDS) {
    const v = body[key];
    row[key] = typeof v === "string" && v.trim() ? v.trim() : null;
  }
  for (const key of PHONE_FIELDS) {
    row[key] = normalizePhoneOrNull(body[key]);
  }

  row.capabilities = Array.isArray(body.capabilities)
    ? [...new Set(body.capabilities.filter((t): t is string => typeof t === "string" && !!t.trim()).map((t) => t.trim()))]
    : [];
  row.capabilities_source = row.capabilities && (row.capabilities as string[]).length ? "manual" : null;

  const conf = Number(body.confidence);
  row.confidence = Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : null;

  const metAt = body.met_at;
  row.met_at = typeof metAt === "string" && metAt.trim() ? metAt : null;

  // 같은 사람의 이전 명함을 대체하는 경우 (직함 변경, 이직 등).
  // 중복 판단은 저장 전 /api/cards/duplicates 에서 사용자가 이미 내렸다.
  const supersedesId =
    typeof body.supersedes_id === "string" && body.supersedes_id ? body.supersedes_id : null;
  row.supersedes_id = supersedesId;

  const { data, error } = await supabase.from("cards").insert(row).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (supersedesId) {
    // 이전 명함은 이력으로만 남긴다 (삭제하지 않는다 — 옛 연락처도 단서가 된다).
    const { error: supersedeError } = await supabase
      .from("cards")
      .update({ is_current: false })
      .eq("id", supersedesId);
    if (supersedeError) {
      return NextResponse.json(
        { id: data.id, warning: `저장했지만 이전 명함 정리에 실패했습니다: ${supersedeError.message}` },
        { status: 207 },
      );
    }
  }

  return NextResponse.json({ id: data.id });
}
