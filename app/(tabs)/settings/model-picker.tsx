"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AISettings, AITaskConfig, EnrichTaskConfig } from "@/lib/ai/settings-store";
import type { EnrichProvider, OAuthAIProvider } from "@/lib/ai/provider-types";
import { Action, StatusBadge } from "@/components/ui";

export type TaskProvider = OAuthAIProvider | EnrichProvider;

interface ModelOption {
  readonly id: string;
  readonly label: string;
}

export interface CatalogEntry {
  readonly provider: TaskProvider;
  readonly kind: "oauth" | "enrich";
  readonly label: string;
  readonly models: readonly ModelOption[];
  readonly connected: boolean;
  readonly available: boolean;
}

const TASKS = [
  { key: "extract", title: "명함 인식", hint: "사진에서 이름·연락처를 읽어내는 작업", kind: "oauth" },
  { key: "ask", title: "질문 답변", hint: "물어보기 화면에서 명함을 찾아 정리하는 작업", kind: "oauth" },
  { key: "enrich", title: "회사 정보 검색", hint: "회사명으로 웹을 검색해 역량 태그를 제안하는 작업", kind: "enrich" },
] as const;

type OAuthTask = "extract" | "ask";

function isOAuthTask(value: string): value is OAuthTask {
  return value === "extract" || value === "ask";
}

function oauthProvider(value: string): OAuthAIProvider | null {
  if (value === "openai-codex" || value === "anthropic-claude") return value;
  return null;
}

function enrichProvider(value: string): EnrichProvider | null {
  if (value === "openai-codex" || value === "anthropic-claude" || value === "openai-api") return value;
  return null;
}

function optionFor(catalog: readonly CatalogEntry[], provider: TaskProvider | null): CatalogEntry | null {
  return catalog.find((entry) => entry.provider === provider) ?? null;
}

function responseMessage(payload: unknown): string {
  if (typeof payload === "object" && payload !== null && "code" in payload && typeof payload.code === "string") return payload.code;
  return "upstream_failure";
}

export function ModelPicker({
  catalog,
  initial,
  defaultLabel,
}: Readonly<{
  catalog: readonly CatalogEntry[];
  initial: AISettings;
  defaultLabel: string | null;
}>) {
  const router = useRouter();
  const [config, setConfig] = useState<AISettings>(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ readonly kind: "ok" | "error"; readonly text: string } | null>(null);
  const dirty = JSON.stringify(config) !== JSON.stringify(initial);

  function setOAuthTask(task: OAuthTask, next: AITaskConfig) {
    setConfig((current) => ({ ...current, [task]: next }));
    setMessage(null);
  }

  function setEnrichTask(next: EnrichTaskConfig) {
    setConfig((current) => ({ ...current, enrich: next }));
    setMessage(null);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const response = await fetch("/api/ai/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    const payload: unknown = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage({ kind: "error", text: responseMessage(payload) });
      return;
    }
    setMessage({ kind: "ok", text: "저장했습니다." });
    router.refresh();
  }

  return (
    <div className="grid gap-3 xl:grid-cols-3">
      {TASKS.map((task) => {
        const current = config[task.key];
        const isEnrich = task.kind === "enrich";
        const taskCatalog = catalog.filter((entry) => entry.kind === task.kind);
        const selected = optionFor(taskCatalog, current.provider);
        return (
          <div key={task.key} className="h-full space-y-3 rounded-xl border border-line bg-paper/60 p-4">
            <div>
              <div className="text-sm font-semibold">{task.title}</div>
              <div className="text-xs text-soft">{task.hint}</div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <label className="grid gap-1">
                <span className="text-xs font-medium text-soft">제공자</span>
                <select
                  value={current.provider ?? ""}
                  onChange={(event) => {
                    if (isEnrich) {
                      const provider = enrichProvider(event.target.value);
                      setEnrichTask({ provider, model: null });
                    } else {
                      const provider = oauthProvider(event.target.value);
                      if (isOAuthTask(task.key)) setOAuthTask(task.key, { provider, model: null });
                    }
                  }}
                  className="ui-field-control"
                >
                  <option value="">기본 AI{defaultLabel ? ` (${defaultLabel})` : ""}</option>
                  {taskCatalog.map((entry) => (
                    <option key={entry.provider} value={entry.provider} disabled={!entry.available}>
                      {entry.label}{entry.available ? "" : " (설정 필요)"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-medium text-soft">모델</span>
                <select
                  value={current.model ?? ""}
                  disabled={!current.provider || !selected || selected.models.length === 0}
                  onChange={(event) => {
                    const model = event.target.value || null;
                    if (isEnrich) {
                      if (current.provider === "openai-codex" || current.provider === "anthropic-claude") {
                        setEnrichTask({ provider: current.provider, model });
                      } else {
                        setEnrichTask({ provider: current.provider, model: null });
                      }
                    } else {
                      if (isOAuthTask(task.key) && (current.provider === "openai-codex" || current.provider === "anthropic-claude" || current.provider === null)) {
                        setOAuthTask(task.key, { provider: current.provider, model });
                      }
                    }
                  }}
                  className="ui-field-control disabled:opacity-50"
                >
                  <option value="">기본 모델</option>
                  {selected?.models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
                </select>
              </label>
            </div>
            {isEnrich && current.provider === null ? (
              <p className="text-xs text-soft">기본값은 현재 활성화된 OAuth 연결을 사용합니다.</p>
            ) : null}
            {isEnrich && current.provider === "openai-codex" ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-warn-soft px-3.5 py-3 text-xs text-warn">
                <StatusBadge tone="warning">비공식·실험</StatusBadge>
                <span>ChatGPT 구독 OAuth 검색은 비공식 backend라 예고 없이 중단될 수 있습니다. 실패 시 자동 전환하지 않으며 Claude 또는 공식 OpenAI API를 직접 선택할 수 있습니다.</span>
              </div>
            ) : null}
            {isEnrich && current.provider === "openai-api" ? (
              <p className="text-xs text-soft">OpenAI API 모델은 서버가 관리하므로 개인별 모델 입력이 없습니다.</p>
            ) : null}
            {isEnrich && current.provider === "openai-api" && !selected?.available ? (
              <StatusBadge tone="warning">서버 API 키 설정 후 사용 가능</StatusBadge>
            ) : null}
          </div>
        );
      })}
      {message ? <p role={message.kind === "error" ? "alert" : "status"} className={`rounded-xl px-3.5 py-2.5 text-sm xl:col-span-3 ${message.kind === "ok" ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"}`}>{message.text}</p> : null}
      {dirty ? <Action className="xl:col-span-3 xl:justify-self-start" onClick={save} loading={saving}>모델 설정 저장</Action> : null}
    </div>
  );
}
