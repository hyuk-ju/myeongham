import { NextResponse, type NextRequest } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { enrichCompany } from "@/lib/ai/enrich";

export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

/**
 * 회사명을 웹에서 조사해 업종·역량 태그 후보를 돌려준다.
 * 저장은 하지 않는다 — 사용자가 확인 후 PATCH 로 반영한다.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const auth = await getAuthorizedUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { user, supabase } = auth;
  const { id } = await params;

  const { data: card } = await supabase
    .from("cards")
    .select("company, company_en, website, address, tax_code")
    .eq("id", id)
    .maybeSingle();

  if (!card) return NextResponse.json({ error: "명함을 찾을 수 없습니다." }, { status: 404 });
  if (!card.company?.trim()) {
    return NextResponse.json(
      { error: "회사명이 비어 있어 검색할 수 없습니다. 회사명을 먼저 입력하세요." },
      { status: 400 },
    );
  }

  try {
    const suggestion = await enrichCompany(supabase, user.id, {
      company: card.company,
      companyEn: card.company_en,
      website: card.website,
      address: card.address,
      taxCode: card.tax_code,
    });
    return NextResponse.json(suggestion);
  } catch (err) {
    const message = err instanceof Error ? err.message : "조사에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
