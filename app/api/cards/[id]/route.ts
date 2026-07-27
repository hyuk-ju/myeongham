import { NextResponse, type NextRequest } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { normalizePhoneOrNull } from "@/lib/phone";

const TEXT_FIELDS = [
  "name", "name_en", "title", "department", "company", "company_en",
  "email", "email2", "website", "address", "postal_code", "tax_code",
  "raw_text", "industry", "notes", "met_context",
] as const;

const PHONE_FIELDS = ["phone", "mobile", "mobile2", "fax"] as const;

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthorizedUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { supabase } = auth;
  const { id } = await params;

  const body = (await request.json()) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  for (const key of TEXT_FIELDS) {
    if (!(key in body)) continue;
    const v = body[key];
    patch[key] = typeof v === "string" && v.trim() ? v.trim() : null;
  }
  for (const key of PHONE_FIELDS) {
    if (!(key in body)) continue;
    patch[key] = normalizePhoneOrNull(body[key]);
  }

  if ("capabilities" in body) {
    patch.capabilities = Array.isArray(body.capabilities)
      ? [...new Set(
          body.capabilities
            .filter((t): t is string => typeof t === "string" && !!t.trim())
            .map((t) => t.trim()),
        )]
      : [];
    // 근거 추적: 웹 검색으로 담은 태그가 섞여 있으면 'web' 으로 남긴다.
    const source = body.capabilities_source === "web" ? "web" : "manual";
    patch.capabilities_source = (patch.capabilities as string[]).length ? source : null;
  }

  if ("met_at" in body) {
    const metAt = body.met_at;
    patch.met_at = typeof metAt === "string" && metAt.trim() ? metAt : null;
  }

  // RLS 가 소유자 검사를 하지만, 결과 0건을 404 로 돌려주기 위해 select 한다.
  const { data, error } = await supabase
    .from("cards")
    .update(patch)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "같은 이메일의 명함이 이미 등록되어 있습니다." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "명함을 찾을 수 없습니다." }, { status: 404 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthorizedUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { supabase } = auth;
  const { id } = await params;

  // 이미지 경로를 먼저 확보한 뒤 행을 지우고, 마지막에 Storage 를 정리한다.
  const { data: card } = await supabase
    .from("cards")
    .select("image_path")
    .eq("id", id)
    .maybeSingle();

  if (!card) return NextResponse.json({ error: "명함을 찾을 수 없습니다." }, { status: 404 });

  const { error } = await supabase.from("cards").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Storage 삭제 실패는 치명적이지 않으므로 (고아 파일만 남음) 무시한다.
  await supabase.storage.from("card-images").remove([card.image_path]);

  return NextResponse.json({ ok: true });
}
