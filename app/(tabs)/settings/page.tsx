import { SignOutButton, UserButton } from "@clerk/nextjs";
import { requireUser } from "@/lib/auth";
import { getTokenRows } from "@/lib/ai/token-store";
import { getAISettings } from "@/lib/ai/settings-store";
import { MODEL_CATALOG } from "@/lib/ai/llm";
import { serverEnv } from "@/lib/env";
import { ConnectAI, type ProviderKey, type ProviderState } from "./connect-ai";
import { ModelPicker, type CatalogEntry } from "./model-picker";
import { SettingsView } from "./settings-view";

const PROVIDERS: readonly ProviderKey[] = ["openai-codex", "anthropic-claude"];

function maskIdentifier(value: string | null): string | null {
  if (!value) return null;
  if (value.length < 5) return "••••";
  return `${value.slice(0, 2)}•••${value.slice(-2)}`;
}

function expirySeverity(value: string | null): "ok" | "soon" | "expired" | undefined {
  if (!value) return undefined;
  const remaining = new Date(value).getTime() - Date.now();
  if (remaining <= 0) return "expired";
  if (remaining <= 7 * 24 * 60 * 60 * 1000) return "soon";
  return "ok";
}

export default async function SettingsPage() {
  const { user, supabase } = await requireUser();
  const [rows, aiSettings] = await Promise.all([
    getTokenRows(supabase, user.id),
    getAISettings(supabase, user.id),
  ]);

  const providers: ProviderState[] = PROVIDERS.map((provider) => {
    const row = rows.find((candidate) => candidate.provider === provider);
    return {
      provider,
      connected: row !== undefined,
      active: row?.is_active ?? false,
      accountId: maskIdentifier(row?.chatgpt_account_id ?? null),
      expiresAt: row?.expires_at ?? null,
      expirySeverity: expirySeverity(row?.expires_at ?? null),
    };
  });

  const activeProvider = providers.find((provider) => provider.connected && provider.active)?.provider ?? null;
  const defaultLabel = activeProvider ? MODEL_CATALOG[activeProvider].label : null;
  const catalog: CatalogEntry[] = [
    ...PROVIDERS.map((provider) => ({
      provider,
      kind: "oauth" as const,
      label: MODEL_CATALOG[provider].label,
      models: MODEL_CATALOG[provider].models.map(({ id, label }) => ({ id, label })),
      connected: rows.some((row) => row.provider === provider),
      available: rows.some((row) => row.provider === provider),
    })),
    {
      provider: "openai-codex" as const,
      kind: "enrich" as const,
      label: "ChatGPT OAuth (비공식·실험)",
      models: MODEL_CATALOG["openai-codex"].models.map(({ id, label }) => ({ id, label })),
      connected: rows.some((row) => row.provider === "openai-codex"),
      available: rows.some((row) => row.provider === "openai-codex"),
    },
    {
      provider: "openai-api" as const,
      kind: "enrich" as const,
      label: "OpenAI API (서버)",
      models: [],
      connected: Boolean(serverEnv.openaiApiKey),
      available: Boolean(serverEnv.openaiApiKey),
    },
    {
      provider: "anthropic-claude" as const,
      kind: "enrich" as const,
      label: MODEL_CATALOG["anthropic-claude"].label,
      models: MODEL_CATALOG["anthropic-claude"].models.map(({ id, label }) => ({ id, label })),
      connected: rows.some((row) => row.provider === "anthropic-claude"),
      available: rows.some((row) => row.provider === "anthropic-claude"),
    },
  ];

  return (
    <SettingsView
      providers={providers}
      catalog={catalog}
      initial={aiSettings}
      defaultLabel={defaultLabel}
      openAI={{ configured: Boolean(serverEnv.openaiApiKey), model: serverEnv.openaiSearchModel }}
      oauthContent={<ConnectAI providers={providers} />}
      modelContent={<ModelPicker catalog={catalog} initial={aiSettings} defaultLabel={defaultLabel} />}
      accountContent={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 break-all text-sm text-soft">{user.email}</p>
          <div className="flex items-center gap-3">
            <UserButton />
            <SignOutButton>
              <button type="button" className="ui-action ui-action-secondary">로그아웃</button>
            </SignOutButton>
          </div>
        </div>
      }
    />
  );
}
