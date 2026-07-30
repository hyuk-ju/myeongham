import { NextResponse, type NextRequest } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { parseCardSaveRequest, type CardSaveRequest } from "@/lib/http-contracts";
import { normalizePhoneOrNull } from "@/lib/phone";

const INVALID_INPUT = { error: "invalid_input" } as const;

type RpcEnvelope = {
  readonly code: string;
  readonly cardId: string | null;
  readonly created: boolean | null;
};

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { user, supabase } = auth;

  const body = await readJson(request);
  if (!body.ok) return NextResponse.json(INVALID_INPUT, { status: 400 });
  const parsed = parseCardSaveRequest(body.value);
  if (!parsed.ok) return NextResponse.json({ error: parsed.code }, { status: 400 });
  const { draft_id: draftId, supersedes_id: supersedesId, image_path: imagePath, ...card } = normalizeCardPayload(parsed.value);
  if (draftId !== null) {
    const result = await supabase.rpc("finalize_card_draft", {
      p_draft_id: draftId,
      p_card: card,
      p_supersedes_id: supersedesId,
    });
    return rpcResponse(result, "finalized");
  }

  if (typeof imagePath !== "string" || !isOwnedImagePath(imagePath, user.id)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const result = await supabase.rpc("save_card", {
    p_card: card,
    p_image_path: imagePath,
    p_supersedes_id: supersedesId,
  });
  return rpcResponse(result, "saved");
}

function normalizeCardPayload(input: CardSaveRequest): CardSaveRequest {
  return {
    ...input,
    phone: normalizePhoneOrNull(input.phone),
    mobile: normalizePhoneOrNull(input.mobile),
    mobile2: normalizePhoneOrNull(input.mobile2),
    fax: normalizePhoneOrNull(input.fax),
    capabilities_source: input.capabilities.length > 0 ? input.capabilities_source : null,
  };
}

function isOwnedImagePath(path: string, ownerId: string): boolean {
  return path.startsWith(`${ownerId}/`) && path.length > ownerId.length + 1 && !path.includes("\\");
}

async function readJson(request: Request): Promise<{ readonly ok: true; readonly value: unknown } | { readonly ok: false }> {
  try {
    return { ok: true, value: await request.json() };
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) return { ok: false };
    throw error;
  }
}

async function rpcResponse(
  result: { readonly data: unknown; readonly error: { readonly message?: string } | null },
  successCode: "saved" | "finalized",
) {
  if (result.error) return NextResponse.json({ error: "invalid_response" }, { status: 500 });
  const envelope = parseRpcEnvelope(result.data);
  if (envelope === null) return NextResponse.json({ error: "invalid_response" }, { status: 500 });
  if (envelope.code === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (envelope.code === "busy") return NextResponse.json({ error: "busy", code: "busy" }, { status: 409 });
  if (envelope.code === "invalid_input" || envelope.code === "invalid_state") {
    return NextResponse.json({ error: envelope.code }, { status: 400 });
  }
  if (envelope.code === "unauthorized") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (envelope.code !== successCode || envelope.cardId === null || !isUuid(envelope.cardId)) {
    return NextResponse.json({ error: envelope.code === successCode ? "invalid_response" : envelope.code }, { status: 500 });
  }
  return NextResponse.json({ id: envelope.cardId, created: envelope.created ?? true });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseRpcEnvelope(value: unknown): RpcEnvelope | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (typeof row !== "object" || row === null || Array.isArray(row)) return null;
  const record = Object.fromEntries(Object.entries(row));
  if (typeof record.code !== "string") return null;
  return {
    code: record.code,
    cardId: typeof record.card_id === "string" ? record.card_id : null,
    created: typeof record.created === "boolean" ? record.created : null,
  };
}
