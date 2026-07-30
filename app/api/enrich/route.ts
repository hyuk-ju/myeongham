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
    return NextResponse.json(suggestion);
  } catch (err) {
    if (err instanceof ProviderAuthError) {
      return NextResponse.json(
        { code: err.code, error: err.code, retryable: err.retryable },
        { status: err.status },
      );
    }
    if (err instanceof CompanySearchError) {
      return NextResponse.json({ code: err.code, error: err.code }, { status: err.status });
    }
    return NextResponse.json(
      { code: "upstream_failure", error: "upstream_failure" },
      { status: 502 },
    );
  }
}
