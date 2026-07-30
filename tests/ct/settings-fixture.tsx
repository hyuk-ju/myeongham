import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { AISettings } from "@/lib/ai/settings-store";
import { Action } from "@/components/ui";
import { ConnectAI, type ProviderState } from "@/app/(tabs)/settings/connect-ai";
import { ModelPicker, type CatalogEntry } from "@/app/(tabs)/settings/model-picker";
import { SettingsView } from "@/app/(tabs)/settings/settings-view";

const provider: ProviderState = {
  provider: "openai-codex",
  connected: true,
  active: true,
  accountId: "ac•••42",
  expiresAt: "2030-01-01T00:00:00.000Z",
  expirySeverity: "ok",
};

const catalog: CatalogEntry[] = [
  {
    provider: "openai-codex",
    kind: "oauth",
    label: "ChatGPT",
    models: [{ id: "gpt-5.6", label: "GPT-5.6" }],
    connected: true,
    available: true,
  },
  {
    provider: "anthropic-claude",
    kind: "oauth",
    label: "Claude",
    models: [{ id: "claude-sonnet", label: "Claude Sonnet" }],
    connected: false,
    available: false,
  },
  {
    provider: "openai-codex",
    kind: "enrich",
    label: "ChatGPT OAuth (비공식·실험)",
    models: [{ id: "gpt-5.6", label: "GPT-5.6" }],
    connected: true,
    available: true,
  },
  {
    provider: "anthropic-claude",
    kind: "enrich",
    label: "Claude",
    models: [{ id: "claude-sonnet", label: "Claude Sonnet" }],
    connected: false,
    available: false,
  },
];

const settingsInitial: AISettings = {
  extract: { provider: "openai-codex", model: null },
  ask: { provider: null, model: null },
  enrich: { provider: "openai-codex", model: null },
};

const routerFixture: AppRouterInstance = {
  back: () => undefined,
  forward: () => undefined,
  refresh: () => undefined,
  push: () => undefined,
  replace: () => undefined,
  prefetch: () => undefined,
};

export function SettingsFixture() {
  return (
    <AppRouterContext.Provider value={routerFixture}>
      <SettingsView
        providers={[provider]}
        catalog={catalog}
        initial={settingsInitial}
        defaultLabel="ChatGPT"
        oauthContent={<ConnectAI providers={[provider]} />}
        modelContent={<ModelPicker catalog={catalog} initial={settingsInitial} defaultLabel="ChatGPT" />}
        accountContent={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 break-words text-sm text-soft [word-break:keep-all]">마스킹 계정 ac•••42</p>
            <Action variant="secondary">로그아웃</Action>
          </div>
        }
      />
    </AppRouterContext.Provider>
  );
}
