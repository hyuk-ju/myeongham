import { NextResponse, type NextRequest } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";

/**
 * 고른 역량 태그를 그 회사 명함 **전체**에 적용한다.
 *
 * 태그는 사람이 아니라 회사에 붙는 정보라, 한 사람에게만 달아두면 동료를
 * 물었을 때 안 걸린다. 회사명 표기 흔들림은 normalize_company 가 흡수한다.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthorizedUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { supabase } = auth;

  const body = (await request.json()) as Record<string, unknown>;
  const company = typeof body.company === "string" ? body.company.trim() : "";
  if (!company) return NextResponse.json({ error: "회사명이 없습니다." }, { status: 400 });

  const capabilities = Array.isArray(body.capabilities)
    ? [
        ...new Set(
          body.capabilities
            .filter((t): t is string => typeof t === "string" && !!t.trim())
            .map((t) => t.trim()),
        ),
      ]
    : [];
  if (!capabilities.length) {
    return NextResponse.json({ error: "적용할 태그가 없습니다." }, { status: 400 });
  }

  const industry = typeof body.industry === "string" && body.industry.trim()
    ? body.industry.trim()
    : null;

  const { data, error } = await supabase.rpc("apply_company_capabilities", {
    p_company: company,
    p_capabilities: capabilities,
    p_industry: industry,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ updated: (data as number) ?? 0 });
}
