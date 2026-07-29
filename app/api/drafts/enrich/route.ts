import { NextResponse, type NextRequest } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { enrichCompany } from "@/lib/ai/enrich";

// 회사를 특정하지 못하면 모델이 검색을 반복해 2분을 넘기는 경우가 있다 (실측).
// Vercel 상한(300초)까지 열어둔다 — 중간에 끊기면 결과가 통째로 날아간다.
export const maxDuration = 300;

/**
 * 대기열의 한 회사를 웹에서 조사해 제안을 담아둔다.
 *
 * 태그를 적용하지는 않는다 — 웹 검색은 동명 회사 오답이 나올 수 있어 사용자가
 * 보고 고르는 게 원칙이다. 검토 화면을 열었을 때 20~40초를 기다리지 않게
 * 미리 받아두는 것뿐이다.
 *
 * 결과는 같은 회사 draft 전체에 꽂는다 — 태그는 사람이 아니라 회사에 붙는
 * 정보라서, 동료가 3명이어도 검색은 한 번이면 된다.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthorizedUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { user, supabase } = auth;

  const body = (await request.json()) as Record<string, unknown>;
  const company = typeof body.company === "string" ? body.company.trim() : "";
  if (!company) return NextResponse.json({ error: "회사명이 없습니다." }, { status: 400 });

  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

  try {
    const suggestion = await enrichCompany(supabase, user.id, {
      company,
      companyEn: str(body.company_en),
      website: str(body.website),
      address: str(body.address),
      taxCode: str(body.tax_code),
    });

    const { data, error } = await supabase.rpc("apply_draft_enrich", {
      p_company: company,
      p_enrich: suggestion,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ suggestion, applied: (data as number) ?? 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "회사 조사에 실패했습니다.";
    // 한도·인증 문제는 뒤 건도 전부 같은 이유로 실패한다 → 워커가 루프를 멈춘다.
    const stopQueue = message.includes("사용량 한도") || message.includes("인증이 만료");
    return NextResponse.json({ error: message, stopQueue }, { status: 502 });
  }
}
