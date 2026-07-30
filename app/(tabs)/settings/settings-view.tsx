"use client";

import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import type { AISettings } from "@/lib/ai/settings-store";
import type { CatalogEntry } from "./model-picker";
import type { ProviderState } from "./connect-ai";
import { Surface } from "@/components/ui";

export interface SettingsViewProps {
  readonly providers: readonly ProviderState[];
  readonly catalog: readonly CatalogEntry[];
  readonly initial: AISettings;
  readonly defaultLabel: string | null;
  readonly oauthContent: ReactNode;
  readonly modelContent: ReactNode;
  readonly accountContent: ReactNode;
}

export function SettingsView({
  oauthContent,
  modelContent,
  accountContent,
}: SettingsViewProps) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-safe-nav pt-8 sm:px-6 lg:px-8 lg:pt-10">
      <header className="mb-6 lg:mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">명함첩 환경</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight lg:text-3xl">설정</h1>
        <p className="mt-1 text-sm text-soft">연결 상태와 작업별 사용 경로를 분리해 관리합니다.</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start xl:grid-cols-12">
        <Surface variant="raised" className="space-y-4 p-4 sm:p-6 lg:col-span-2 lg:col-start-1 lg:row-start-1 xl:col-span-8 xl:row-start-1">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"><ShieldCheck aria-hidden="true" className="size-5" /></span>
            <div>
              <h2 className="text-lg font-semibold">사용자 OAuth 연결</h2>
              <p className="mt-1 text-sm text-soft">명함 인식·질문과 회사 검색에 사용할 ChatGPT 또는 Claude 계정을 연결합니다. 둘 다 연결해두면 작업별 모델에서 사용할 제공자를 고를 수 있습니다.</p>
            </div>
          </div>
          {oauthContent}
          <p className="rounded-xl bg-paper/70 px-3.5 py-3 text-sm text-soft">회사 검색은 연결된 ChatGPT OAuth 또는 Claude OAuth 중에서 선택합니다. 기본값은 현재 활성화된 OAuth 연결을 사용합니다.</p>
        </Surface>

        <Surface variant="slip" className="space-y-4 p-4 sm:p-6 lg:col-span-2 lg:col-start-1 lg:row-start-2 xl:col-span-8 xl:row-start-2">
          <div>
            <h2 className="text-lg font-semibold">작업별 모델</h2>
            <p className="mt-1 text-sm text-soft">작업마다 OAuth 연결을 선택합니다. 비공식 실험 경로는 표시된 위험을 확인한 뒤 선택하며, 제공자와 맞지 않는 모델은 저장할 수 없습니다.</p>
          </div>
          {modelContent}
        </Surface>

        <Surface className="space-y-3 p-4 sm:p-6 lg:col-span-2 lg:col-start-1 lg:row-start-3 xl:col-span-4 xl:col-start-9 xl:row-start-1">
          <h2 className="text-lg font-semibold">계정</h2>
          {accountContent}
        </Surface>
      </div>
    </main>
  );
}

export function settingsFixtureSummary(props: Pick<SettingsViewProps, "providers" | "catalog" | "initial" | "defaultLabel">): string {
  return `${props.providers.length} providers · ${props.catalog.length} options · ${props.initial.enrich.provider} · ${props.defaultLabel ?? "none"}`;
}
