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
              명함 이미지를 읽어 정보를 추출하고, 질문에 답하는 데 사용됩니다.
              구독으로 처리되어 API 요금이 따로 나가지 않습니다. 둘 다 연결해 두고
              한도에 걸리면 전환할 수 있습니다.
            </p>
          </div>
          <ConnectAI providers={providers} />
        </section>

        <section className="space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <div>
            <h2 className="font-semibold">작업별 모델</h2>
            <p className="mt-1 text-sm text-soft">
              명함 인식과 질문 답변에 서로 다른 AI·모델을 쓸 수 있습니다.
              비워 두면 위에서 &ldquo;사용 중&rdquo;인 AI의 기본 모델을 씁니다.
            </p>
          </div>
          <ModelPicker catalog={catalog} initial={aiSettings} />
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
