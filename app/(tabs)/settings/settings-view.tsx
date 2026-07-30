"use client";

import type { ReactNode } from "react";
import { CheckCircle2, CircleAlert, KeyRound, ShieldCheck } from "lucide-react";
import type { AISettings } from "@/lib/ai/settings-store";
import type { CatalogEntry } from "./model-picker";
import type { ProviderState } from "./connect-ai";
import { Surface, StatusBadge } from "@/components/ui";

export interface ServerOpenAIStatus {
  readonly configured: boolean;
  readonly model: string;
}

export interface SettingsViewProps {
  readonly providers: readonly ProviderState[];
  readonly catalog: readonly CatalogEntry[];
  readonly initial: AISettings;
  readonly defaultLabel: string | null;
  readonly openAI: ServerOpenAIStatus;
  readonly oauthContent: ReactNode;
  readonly modelContent: ReactNode;
  readonly accountContent: ReactNode;
}

export function SettingsView({
  openAI,
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
        <Surface variant="raised" className="space-y-4 p-4 sm:p-6 lg:col-span-2 lg:col-start-1 lg:row-start-1 xl:col-span-8 xl:row-span-2">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"><ShieldCheck aria-hidden="true" className="size-5" /></span>
            <div>
              <h2 className="text-lg font-semibold">사용자 OAuth 연결</h2>
              <p className="mt-1 text-sm text-soft">명함 인식·질문과 선택적인 회사 검색에 사용할 ChatGPT 또는 Claude 계정을 연결합니다. ChatGPT 회사 검색은 비공식 실험 경로이며 OAuth 연결과 서버 API는 서로 다릅니다.</p>
            </div>
          </div>
          {oauthContent}
          <p className="rounded-xl bg-paper/70 px-3.5 py-3 text-sm text-soft">회사 검색은 ChatGPT OAuth 실험 경로, Claude OAuth, 공식 OpenAI API 중에서 고를 수 있습니다. 공식 API를 선택한 경우에만 ChatGPT 구독과 별도 API 요금이 발생합니다.</p>
        </Surface>

        <Surface variant="slip" className="space-y-4 p-4 sm:p-6 lg:col-start-1 lg:row-start-2 xl:col-span-4 xl:col-start-9 xl:row-start-1">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"><KeyRound aria-hidden="true" className="size-5" /></span>
            <div>
              <h2 className="text-lg font-semibold">서버 소유 OpenAI API</h2>
              <p className="mt-1 text-sm text-soft">회사 정보 검색에서만 사용합니다. 키는 서버 환경에만 있고 이 화면이나 브라우저로 내려오지 않습니다.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-paper/60 p-4">
            <div className="flex items-center gap-2">
              {openAI.configured ? <CheckCircle2 aria-hidden="true" className="size-5 text-ok" /> : <CircleAlert aria-hidden="true" className="size-5 text-warn" />}
              <div>
                <p className="font-semibold">OpenAI API 검색</p>
                <p className="text-sm text-soft">모델 {openAI.model}</p>
              </div>
            </div>
            <StatusBadge tone={openAI.configured ? "success" : "warning"}>{openAI.configured ? "서버에 설정됨" : "설정 필요"}</StatusBadge>
          </div>
          <p className="text-sm text-soft">이 상태는 서버 환경 변수의 존재 여부만 표시합니다. API 키·토큰·전체 계정 ID는 표시하지 않습니다. OpenAI API 사용료는 ChatGPT 구독과 별도입니다.</p>
        </Surface>

        <Surface variant="slip" className="space-y-4 p-4 sm:p-6 lg:col-span-2 lg:col-start-1 lg:row-start-3 xl:col-span-12 xl:row-start-3">
          <div>
            <h2 className="text-lg font-semibold">작업별 모델</h2>
            <p className="mt-1 text-sm text-soft">작업마다 OAuth 연결 또는 공식 서버 검색을 선택합니다. 비공식 실험 경로는 표시된 위험을 확인한 뒤 선택하며, 제공자와 맞지 않는 모델은 저장할 수 없습니다.</p>
          </div>
          {modelContent}
        </Surface>

        <Surface className="space-y-3 p-4 sm:p-6 lg:col-start-2 lg:row-start-2 xl:col-span-4 xl:col-start-9 xl:row-start-2">
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
