import { SignOutButton, UserButton } from "@clerk/nextjs";
import { requireUser } from "@/lib/auth";
import { getTokenRows } from "@/lib/ai/token-store";
import { getAISettings } from "@/lib/ai/settings-store";
import { MODEL_CATALOG } from "@/lib/ai/llm";
import { ConnectAI, type ProviderKey, type ProviderState } from "./connect-ai";
import { ModelPicker, type CatalogEntry } from "./model-picker";

const PROVIDERS: ProviderKey[] = ["openai-codex", "anthropic-claude"];

export default async function SettingsPage() {
  const { user, supabase } = await requireUser();
  const [rows, aiSettings] = await Promise.all([
    getTokenRows(supabase, user.id),
    getAISettings(supabase, user.id),
  ]);

  const providers: ProviderState[] = PROVIDERS.map((provider) => {
    const row = rows.find((r) => r.provider === provider);
    return {
      provider,
      connected: !!row,
      active: row?.is_active ?? false,
      accountId: row?.chatgpt_account_id ?? null,
      expiresAt: row?.expires_at ?? null,
    };
  });

  // 작업별 설정을 비워 뒀을 때 실제로 쓰이는 AI — 화면에 이름을 보여준다.
  const activeProvider = providers.find((p) => p.connected && p.active)?.provider ?? null;
  const defaultLabel = activeProvider ? MODEL_CATALOG[activeProvider].label : null;

  const catalog: CatalogEntry[] = PROVIDERS.map((provider) => ({
    provider,
    label: MODEL_CATALOG[provider].label,
    models: MODEL_CATALOG[provider].models.map(({ id, label }) => ({ id, label })),
    connected: rows.some((r) => r.provider === provider),
  }));

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-8">
      <header className="mb-6">
        <h1 className="text-[22px] font-bold tracking-tight">설정</h1>
      </header>

      <div className="space-y-4">
        <section className="space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <div>
            <h2 className="font-semibold">AI 분석 연결</h2>
            <p className="mt-1 text-sm text-soft">
              명함 이미지를 읽고, 질문에 답하고, 회사 정보를 웹에서 찾는 데 씁니다.
              구독으로 처리되어 API 요금이 따로 나가지 않습니다. 둘 다 연결해 두면
              한도에 걸렸을 때 옮겨서 계속 쓸 수 있습니다.
              <br />
              <strong className="font-semibold text-foreground">기본 AI</strong> 는 아래
              작업별 설정을 비워 뒀을 때 쓰이는 AI 입니다.
            </p>
          </div>
          <ConnectAI providers={providers} />
        </section>

        <section className="space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <div>
            <h2 className="font-semibold">작업별 모델</h2>
            <p className="mt-1 text-sm text-soft">
              작업마다 다른 AI 를 쓸 수 있습니다 — 예를 들어 명함 인식은 ChatGPT,
              질문 답변은 Claude 로 나눠 둘 수 있습니다. 비워 두면 위에서 정한
              기본 AI 를 씁니다.
            </p>
          </div>
          <ModelPicker catalog={catalog} initial={aiSettings} defaultLabel={defaultLabel} />
        </section>

        <section className="space-y-3 rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <h2 className="font-semibold">계정</h2>
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm text-soft">{user.email}</p>
            <UserButton />
          </div>
          <SignOutButton>
            <button className="rounded-xl border border-line px-3.5 py-2 text-sm font-medium text-soft">
              로그아웃
            </button>
          </SignOutButton>
        </section>
      </div>
    </main>
  );
}
