import { NextResponse, type NextRequest } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";

export interface CompanyTag {
  tag: string;
  /** 같은 회사 카드 중 이 태그를 가진 장수 */
  card_count: number;
}

export interface CompanyCapabilities {
  tags: CompanyTag[];
  /** 자기 자신을 뺀 같은 회사 카드 장수 */
  total_cards: number;
}

/**
 * 같은 회사의 다른 명함이 이미 가진 역량 태그를 모아 준다.
 *
 * 웹 검색을 사람 수만큼 반복하지 않고, 회사에 한 번 붙인 태그를 동료 카드에
 * 그대로 재사용하기 위한 것이다. 회사명 표기 흔들림은 normalize_company 가 흡수한다.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthorizedUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const company = request.nextUrl.searchParams.get("company")?.trim();
  if (!company) {
    return NextResponse.json({ tags: [], total_cards: 0 } satisfies CompanyCapabilities);
  }

  // 상세 화면에서는 보고 있는 카드 자신을 제외해야 "이미 있는 태그" 가 되지 않는다.
  const exclude = request.nextUrl.searchParams.get("exclude")?.trim() || null;

  const { data, error } = await auth.supabase.rpc("company_capabilities", {
    p_company: company,
    p_exclude: exclude,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as { tag: string; card_count: number; total_cards: number }[];
  return NextResponse.json({
    tags: rows.map(({ tag, card_count }) => ({ tag, card_count })),
    total_cards: rows[0]?.total_cards ?? 0,
  } satisfies CompanyCapabilities);
}
