"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type ProviderKey = "openai-codex" | "anthropic-claude";

export interface ProviderState {
  provider: ProviderKey;
  connected: boolean;
  active: boolean;
  accountId: string | null;
  expiresAt: string | null;
}

const META: Record<
  ProviderKey,
  {
    label: string;
    subscription: string;
    api: { start: string; finish: string; disconnect: string };
    /** finish 요청 body 의 키 이름 (chatgpt 는 URL, claude 는 코드) */
    finishKey: "callbackUrl" | "code";
    pastePlaceholder: string;
    steps: React.ReactNode[];
  }
> = {
  "openai-codex": {
    label: "ChatGPT",
    subscription: "ChatGPT Plus/Pro 구독",
    api: {
      start: "/api/chatgpt/start",
      finish: "/api/chatgpt/finish",
      disconnect: "/api/chatgpt/disconnect",
    },
    finishKey: "callbackUrl",
    pastePlaceholder: "http://localhost:1455/auth/callback?code=...&state=...",
    steps: [
      "새 탭에서 ChatGPT 로그인을 마칩니다.",
      <>
        로그인이 끝나면 <code className="rounded bg-paper px-1">localhost:1455</code> 로
        이동하며 <strong className="text-ink">연결할 수 없음</strong> 오류가 뜹니다.
        정상입니다.
      </>,
      <>
        그 페이지의 <strong className="text-ink">주소창 URL 전체</strong>를 복사해 아래에
        붙여넣으세요.
      </>,
    ],
  },
  "anthropic-claude": {
    label: "Claude",
    subscription: "Claude Pro/Max 구독",
    api: {
      start: "/api/claude/start",
      finish: "/api/claude/finish",
      disconnect: "/api/claude/disconnect",
    },
    finishKey: "code",
    pastePlaceholder: "화면에 표시된 인증 코드 (…#… 형태)",
    steps: [
      "새 탭에서 Claude 로그인과 권한 승인을 마칩니다.",
      <>
        승인이 끝나면 화면에 <strong className="text-ink">인증 코드</strong>가
        표시됩니다.
      </>,
      <>
        그 코드를 <strong className="text-ink">전체 복사</strong>해 아래에 붙여넣으세요.
      </>,
    ],
  },
};

type Step = "idle" | "awaiting-paste" | "saving";

function ProviderCard({ state }: { state: ProviderState }) {
  const meta = META[state.provider];
  const router = useRouter();
  const [step, setStep] = useState<Step>("idle");
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  async function start() {
    setError(null);
    const res = await fetch(meta.api.start, { method: "POST" });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "연결을 시작하지 못했습니다.");
      return;
    }
    window.open(json.authorizeUrl, "_blank", "noopener,noreferrer");
    setStep("awaiting-paste");
  }

  async function finish() {
    setError(null);
    setStep("saving");
    const res = await fetch(meta.api.finish, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [meta.finishKey]: pasted }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "연결에 실패했습니다.");
      setStep("awaiting-paste");
      return;
    }
    setPasted("");
    setStep("idle");
    router.refresh();
  }

  async function disconnect() {
    if (!confirm(`${meta.label} 연결을 해제할까요?`)) return;
    await fetch(meta.api.disconnect, { method: "POST" });
    router.refresh();
  }

  async function activate() {
    setSwitching(true);
    setError(null);
    const res = await fetch("/api/ai/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: state.provider }),
    });
    setSwitching(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "전환에 실패했습니다.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3 rounded-xl border border-line bg-paper/60 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{meta.label}</span>
          {state.active && (
            <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand">
              기본 AI
            </span>
          )}
        </div>
        {state.connected ? (
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-ok">
            <span className="inline-block h-2 w-2 rounded-full bg-ok" />
            연결됨
          </span>
        ) : (
          <span className="text-[13px] text-faint">{meta.subscription}</span>
        )}
      </div>

      {state.connected && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
          <dt className="text-soft">계정</dt>
          <dd className="truncate font-mono text-xs leading-5">{state.accountId ?? "—"}</dd>
          {state.expiresAt && (
            <>
              <dt className="text-soft">토큰 만료</dt>
              <dd>{new Date(state.expiresAt).toLocaleString("ko-KR")}</dd>
            </>
          )}
        </dl>
      )}

      {step === "idle" && (
        <div className="flex flex-wrap gap-2">
          {!state.connected && (
            <button
              onClick={start}
              className="rounded-xl bg-brand px-3.5 py-2 text-sm font-semibold text-brand-ink"
            >
              {meta.label} 연결하기
            </button>
          )}
          {state.connected && !state.active && (
            <button
              onClick={activate}
              disabled={switching}
              className="rounded-xl bg-brand px-3.5 py-2 text-sm font-semibold text-brand-ink disabled:opacity-50"
            >
              {switching ? "전환 중…" : "기본 AI 로 지정"}
            </button>
          )}
          {state.connected && (
            <>
              <button
                onClick={start}
                className="rounded-xl border border-line px-3.5 py-2 text-sm font-medium"
              >
                다시 연결
              </button>
              <button
                onClick={disconnect}
                className="rounded-xl border border-danger/30 px-3.5 py-2 text-sm font-medium text-danger"
              >
                해제
              </button>
            </>
          )}
        </div>
      )}

      {(step === "awaiting-paste" || step === "saving") && (
        <div className="space-y-3">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-soft">
            {meta.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>

          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={meta.pastePlaceholder}
            rows={3}
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 font-mono text-xs outline-none focus:border-brand"
          />

          <div className="flex gap-2">
            <button
              onClick={finish}
              disabled={!pasted.trim() || step === "saving"}
              className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink disabled:opacity-50"
            >
              {step === "saving" ? "연결 중…" : "연결 완료"}
            </button>
            <button
              onClick={() => {
                setStep("idle");
                setError(null);
              }}
              className="rounded-xl border border-line px-4 py-2.5 text-sm font-medium"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</p>
      )}
    </div>
  );
}

export function ConnectAI({ providers }: { providers: ProviderState[] }) {
  return (
    <div className="space-y-3">
      {providers.map((p) => (
        <ProviderCard key={p.provider} state={p} />
      ))}
    </div>
  );
}
