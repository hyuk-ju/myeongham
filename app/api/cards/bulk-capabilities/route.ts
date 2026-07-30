import type { NextRequest } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import {
  errorResponse,
  jsonResponse,
  parseBulkCapabilitiesRequest,
  parseBulkCapabilitiesResult,
} from "@/lib/http-contracts";

/**
 * 고른 역량 태그를 그 회사 명함 **전체**에 적용한다.
 *
 * 태그는 사람이 아니라 회사에 붙는 정보라, 한 사람에게만 달아두면 동료를
 * 물었을 때 안 걸린다. 회사명 표기 흔들림은 normalize_company 가 흡수한다.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthorizedUser();
  if (!auth) return errorResponse("unauthorized");
  const { supabase } = auth;

  const body = await parseBulkCapabilitiesRequest(request);
  if (!body.ok) return errorResponse(body.code);

  const { data, error } = await supabase.rpc("apply_company_capabilities", {
    p_company: body.value.company,
    p_capabilities: body.value.capabilities,
    p_industry: body.value.industry,
  });
  if (error) return errorResponse("invalid_response");

  const updated = parseBulkCapabilitiesResult(data);
  if (!updated.ok) return errorResponse(updated.code);
  return jsonResponse({ updated: updated.value });
}
