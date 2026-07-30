"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Link2, Unplug } from "lucide-react";
import { Action, StatusBadge } from "@/components/ui";

export type ProviderKey = "openai-codex" | "anthropic-claude";

export interface ProviderState {
  readonly provider: ProviderKey; readonly connected: boolean; readonly active: boolean;
  readonly accountId: string | null; readonly expiresAt: string | null; readonly expirySeverity?: "ok" | "soon" | "expired";
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> { return typeof value === "object" && value !== null; }
async function readPayload(response: Response): Promise<Readonly<Record<string, unknown>>> { const value: unknown = await response.json(); return isRecord(value) ? value : {}; }
function errorCode(payload: Readonly<Record<string, unknown>>, fallback: string): string { return typeof payload.error === "string" ? payload.error : fallback; }

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
    subscription: "OAuth 계정 연결",
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
    subscription: "OAuth 계정 연결",
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
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  async function start() {
    setError(null);
    const res = await fetch(meta.api.start, { method: "POST" });
    const json = await readPayload(res);
    if (!res.ok) {
      setError(errorCode(json, "연결을 시작하지 못했습니다."));
      return;
    }
    if (typeof json.authorizeUrl !== "string") {
      setError("invalid_response");
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
    const json = await readPayload(res);
    if (!res.ok) {
      setError(errorCode(json, "연결에 실패했습니다."));
      setStep("awaiting-paste");
      return;
    }
    setPasted("");
    setStep("idle");
    router.refresh();
  }

  async function disconnect() {
    await fetch(meta.api.disconnect, { method: "POST" });
    setConfirmingDisconnect(false);
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
      const json = await readPayload(res);
      setError(errorCode(json, "전환에 실패했습니다."));
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
          <StatusBadge tone="success"><Check aria-hidden="true" className="mr-1 size-3.5" />연결됨</StatusBadge>
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
              <dd className={state.expirySeverity === "expired" ? "font-semibold text-danger" : state.expirySeverity === "soon" ? "font-semibold text-warn" : "text-soft"}>
                {state.expirySeverity === "expired" ? "만료됨" : state.expirySeverity === "soon" ? "7일 이내 만료" : "유효"}
              </dd>
            </>
          )}
        </dl>
      )}

      {step === "idle" && (
        <div className="flex flex-wrap gap-2">
          {!state.connected && (
            <Action onClick={start}>
              {meta.label} 연결하기
            </Action>
          )}
          {state.connected && !state.active && (
            <Action onClick={activate} loading={switching}>
              {switching ? "전환 중…" : "기본 AI 로 지정"}
            </Action>
          )}
          {state.connected && (
            <>
              <Action variant="secondary" onClick={start}>
                다시 연결
              </Action>
              {confirmingDisconnect ? (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-danger/30 bg-danger-soft p-2.5 text-sm text-danger">
                  <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
                  <span className="mr-1">{meta.label} 연결을 해제할까요?</span>
                  <Action variant="danger" icon={<Unplug aria-hidden="true" className="size-4" />} onClick={disconnect}>해제 확인</Action>
                  <Action variant="quiet" onClick={() => setConfirmingDisconnect(false)}>취소</Action>
                </div>
              ) : (
                <Action variant="secondary" icon={<Unplug aria-hidden="true" className="size-4" />} onClick={() => setConfirmingDisconnect(true)}>해제</Action>
              )}
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
            autoComplete="off"
            rows={3}
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 font-mono text-xs outline-none focus:border-brand"
          />

          <div className="flex gap-2">
            <Action disabled={!pasted.trim()} loading={step === "saving"} onClick={finish}>
              {step === "saving" ? "연결 중…" : "연결 완료"}
            </Action>
            <Action
              variant="secondary"
              onClick={() => {
                setStep("idle");
                setError(null);
                setPasted("");
              }}
            >
              취소
            </Action>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="flex items-center gap-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger"><Link2 aria-hidden="true" className="size-4" />{error}</p>
      )}
    </div>
  );
}

export function ConnectAI({ providers }: { providers: ProviderState[] }) {
  return <div className="space-y-3">{providers.map((provider) => <ProviderCard key={provider.provider} state={provider} />)}</div>;
}
