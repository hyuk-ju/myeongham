import { NextResponse, type NextRequest } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { enrichCompany } from "@/lib/ai/enrich";

export const maxDuration = 120;

/**
 * 회사명을 웹에서 조사해 업종·역량 태그 후보를 돌려준다.
 *
 * 카드 ID 가 아니라 필드를 직접 받는다. 그래야 아직 저장하지 않은 촬영 화면에서도
 * 쓸 수 있고, 사용자가 폼에서 회사명을 고쳤다면 고친 값으로 검색된다.
 * 저장은 하지 않는다 — 사용자가 확인 후 반영한다.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthorizedUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { user, supabase } = auth;

  const body = (await request.json()) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

  const company = str(body.company);
  if (!company) {
    return NextResponse.json(
      { error: "회사명이 비어 있어 검색할 수 없습니다. 회사명을 먼저 입력하세요." },
      { status: 400 },
    );
  }

  try {
    const suggestion = await enrichCompany(supabase, user.id, {
      company,
      companyEn: str(body.company_en),
      website: str(body.website),
      address: str(body.address),
      taxCode: str(body.tax_code),
    });
    return NextResponse.json(suggestion);
  } catch (err) {
    const message = err instanceof Error ? err.message : "조사에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
