import { NextResponse, type NextRequest } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { saveAISettings, type AISettings } from "@/lib/ai/settings-store";
import { MODEL_CATALOG } from "@/lib/ai/llm";
import type { AIProvider } from "@/lib/ai/token-store";

const PROVIDERS = Object.keys(MODEL_CATALOG) as AIProvider[];

/** 제공자/모델 조합이 카탈로그에 있는지 확인 — 임의 문자열 저장을 막는다. */
function parseTaskConfig(raw: unknown): { provider: AIProvider | null; model: string | null } {
  const value = (raw ?? {}) as { provider?: unknown; model?: unknown };
  const provider = PROVIDERS.includes(value.provider as AIProvider)
    ? (value.provider as AIProvider)
    : null;
  if (!provider) return { provider: null, model: null };

  const model =
    typeof value.model === "string" &&
    MODEL_CATALOG[provider].models.some((m) => m.id === value.model)
      ? value.model
      : null;
  return { provider, model };
}

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    extract?: unknown;
    ask?: unknown;
    enrich?: unknown;
  };
  const settings: AISettings = {
    extract: parseTaskConfig(body.extract),
    ask: parseTaskConfig(body.ask),
    enrich: parseTaskConfig(body.enrich),
  };

  try {
    await saveAISettings(auth.supabase, auth.user.id, settings);
    return NextResponse.json({ ok: true, settings });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "저장에 실패했습니다." },
      { status: 500 },
    );
  }
}
