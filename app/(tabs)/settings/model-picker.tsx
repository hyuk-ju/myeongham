"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProviderKey } from "./connect-ai";

interface ModelOption {
  id: string;
  label: string;
}

export interface CatalogEntry {
  provider: ProviderKey;
  label: string;
  models: ModelOption[];
  connected: boolean;
}

export interface TaskConfig {
  provider: ProviderKey | null;
  model: string | null;
}

const TASKS = [
  {
    key: "extract" as const,
    title: "명함 인식",
    hint: "사진에서 이름·연락처를 읽어내는 작업",
  },
  {
    key: "ask" as const,
    title: "질문 답변",
    hint: "물어보기 화면에서 명함을 찾아 정리하는 작업",
  },
  {
    key: "enrich" as const,
    title: "회사 정보 검색",
    hint: "회사명으로 웹을 뒤져 역량 태그를 제안하는 작업",
  },
];

type TaskKey = (typeof TASKS)[number]["key"];

export function ModelPicker({
  catalog,
  initial,
  defaultLabel,
}: {
  catalog: CatalogEntry[];
  initial: Record<TaskKey, TaskConfig>;
  /** 비워 뒀을 때 실제로 쓰이는 AI 이름 — 무엇이 쓰이는지 보이게 한다 */
  defaultLabel: string | null;
}) {
  const router = useRouter();
  const [config, setConfig] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const dirty = JSON.stringify(config) !== JSON.stringify(initial);
  const connected = catalog.filter((c) => c.connected);

  function setTask(task: TaskKey, next: TaskConfig) {
    setConfig((c) => ({ ...c, [task]: next }));
    setMessage(null);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/ai/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    setSaving(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setMessage({ kind: "error", text: json.error ?? "저장에 실패했습니다." });
      return;
    }
    setMessage({ kind: "ok", text: "저장했습니다." });
    router.refresh();
  }

  if (!connected.length) {
    return (
      <p className="rounded-xl border border-line bg-paper/60 px-3.5 py-3 text-sm text-soft">
        AI를 연결하면 작업별로 모델을 고를 수 있습니다.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {TASKS.map(({ key, title, hint }) => {
        const current = config[key];
        return (
          <div key={key} className="space-y-2 rounded-xl border border-line bg-paper/60 p-4">
            <div>
              <div className="text-sm font-semibold">{title}</div>
              <div className="text-xs text-faint">{hint}</div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-[11px] font-medium text-soft">AI</span>
                <select
                  value={current.provider ?? ""}
                  onChange={(e) => {
                    const provider = (e.target.value || null) as ProviderKey | null;
                    // 제공자를 바꾸면 이전 모델은 무효 — 기본값(자동)으로 되돌린다.
                    setTask(key, { provider, model: null });
                  }}
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-[16px] outline-none focus:border-brand"
                >
                  <option value="">
                    {defaultLabel ? `기본 AI (${defaultLabel})` : "기본 AI"}
                  </option>
                  {connected.map((c) => (
                    <option key={c.provider} value={c.provider}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1">
                <span className="text-[11px] font-medium text-soft">모델</span>
                <select
                  value={current.model ?? ""}
                  disabled={!current.provider}
                  onChange={(e) =>
                    setTask(key, { ...current, model: e.target.value || null })
                  }
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-[16px] outline-none focus:border-brand disabled:opacity-50"
                >
                  <option value="">기본</option>
                  {catalog
                    .find((c) => c.provider === current.provider)
                    ?.models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          </div>
        );
      })}

      {message && (
        <p
          className={`rounded-xl px-3.5 py-2.5 text-sm ${
            message.kind === "ok" ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"
          }`}
        >
          {message.text}
        </p>
      )}

      {dirty && (
        <button
          onClick={save}
          disabled={saving}
          className="w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink disabled:opacity-60"
        >
          {saving ? "저장 중…" : "모델 설정 저장"}
        </button>
      )}
    </div>
  );
}
