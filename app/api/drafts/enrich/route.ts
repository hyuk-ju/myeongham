import { NextResponse, type NextRequest } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { enrichCompany } from "@/lib/ai/enrich";
import {
  CompanySearchError,
  parseCompanySearchInput,
} from "@/lib/ai/openai-company-search";
import { ProviderAuthError } from "@/lib/ai/provider-types";

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: "invalid_input", error: "invalid_input" }, { status: 400 });
  }
  const input = parseCompanySearchInput(body);
  if (!input) {
    return NextResponse.json({ code: "invalid_input", error: "invalid_input" }, { status: 400 });
  }

  try {
    const suggestion = await enrichCompany(supabase, user.id, input);

    const { data, error } = await supabase.rpc("apply_draft_enrich", {
      p_company: input.company,
      p_enrich: suggestion,
    });
    if (error) {
      return NextResponse.json(
        { code: "upstream_failure", error: "upstream_failure", stopQueue: false },
        { status: 502 },
      );
    }

    return NextResponse.json({ suggestion, applied: typeof data === "number" ? data : 0 });
  } catch (err) {
    if (err instanceof ProviderAuthError) {
      return NextResponse.json(
        { code: err.code, error: err.code, stopQueue: true, retryable: err.retryable },
        { status: err.status },
      );
    }
    if (err instanceof CompanySearchError) {
      const stopQueue = err.code === "provider_unconfigured" || err.code === "rate_limited" || err.code === "invalid_provider_response";
      return NextResponse.json(
        { code: err.code, error: err.code, stopQueue },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { code: "upstream_failure", error: "upstream_failure", stopQueue: false },
      { status: 502 },
    );
  }
}
