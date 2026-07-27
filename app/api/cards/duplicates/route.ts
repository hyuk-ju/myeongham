import { NextResponse, type NextRequest } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { normalizePhoneOrNull } from "@/lib/phone";

export interface DuplicateCandidate {
  id: string;
  company: string | null;
  name: string | null;
  title: string | null;
  department: string | null;
  mobile: string | null;
  email: string | null;
  is_current: boolean;
  created_at: string;
  /** same_person: 연락처나 회사+이름이 일치 / same_company: 회사만 일치 */
  match_kind: "same_person" | "same_company";
}

/**
 * 저장 직전 중복 후보를 조회한다.
 * 저장을 막지는 않는다 — 판단은 사용자가 한다.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthorizedUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json()) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

  const { data, error } = await auth.supabase.rpc("find_duplicate_candidates", {
    p_email: str(body.email),
    p_email2: str(body.email2),
    p_mobile: normalizePhoneOrNull(body.mobile),
    p_mobile2: normalizePhoneOrNull(body.mobile2),
    p_company: str(body.company),
    p_name: str(body.name),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const candidates = (data ?? []) as DuplicateCandidate[];
  return NextResponse.json({
    samePerson: candidates.filter((c) => c.match_kind === "same_person"),
    sameCompany: candidates.filter((c) => c.match_kind === "same_company"),
  });
}
