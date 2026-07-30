import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthorizedUser } from "@/lib/auth";
import { saveAISettings, type StoredAISettings } from "@/lib/ai/settings-store";
import { MODEL_CATALOG } from "@/lib/ai/llm";

const OAUTH_CONFIG_SCHEMA = z
  .object({
    provider: z.enum(["openai-codex", "anthropic-claude"]).nullable(),
    model: z.string().nullable(),
  })
  .strict()
  .superRefine((config, context) => {
    if (config.provider === null && config.model !== null) {
      context.addIssue({ code: "custom", message: "model_requires_provider" });
      return;
    }
    if (
      config.provider !== null &&
      config.model !== null &&
      !MODEL_CATALOG[config.provider].models.some((model) => model.id === config.model)
    ) {
      context.addIssue({ code: "custom", message: "invalid_model" });
    }
  });

const ENRICH_CONFIG_SCHEMA = z
  .object({
    provider: z.enum(["openai-codex", "anthropic-claude", "openai-api"]).nullable(),
    model: z.string().nullable(),
  })
  .strict()
  .superRefine((config, context) => {
    if (config.provider === null && config.model !== null) {
      context.addIssue({ code: "custom", message: "model_requires_provider" });
      return;
    }
    if (config.provider === "openai-api" && config.model !== null) {
      context.addIssue({ code: "custom", message: "openai_model_is_server_owned" });
      return;
    }
    if (config.provider !== null && config.provider !== "openai-api" && config.model !== null &&
      !MODEL_CATALOG[config.provider].models.some((model) => model.id === config.model)) {
      context.addIssue({ code: "custom", message: "invalid_model" });
    }
  })
  .transform((config) =>
    config.provider === "openai-api" ? { provider: "openai-api" as const, model: null } : config,
  );

export const AI_SETTINGS_REQUEST_SCHEMA = z
  .object({
    extract: OAUTH_CONFIG_SCHEMA,
    ask: OAUTH_CONFIG_SCHEMA,
    enrich: ENRICH_CONFIG_SCHEMA,
  })
  .strict();

function invalidInput() {
  return NextResponse.json(
    { code: "invalid_input", error: "invalid_input" },
    { status: 400 },
  );
}

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidInput();
  }
  const parsed = AI_SETTINGS_REQUEST_SCHEMA.safeParse(body);
  if (!parsed.success) return invalidInput();

  const settings: StoredAISettings = {
    extract: parsed.data.extract,
    ask: parsed.data.ask,
    enrich: parsed.data.enrich,
  };
  try {
    await saveAISettings(auth.supabase, auth.user.id, settings);
    return NextResponse.json({ ok: true, settings });
  } catch {
    return NextResponse.json(
      { code: "upstream_failure", error: "upstream_failure" },
      { status: 500 },
    );
  }
}
