"use client";

import { useState } from "react";

export interface EnrichSuggestion {
  industry: string | null;
  capabilities: string[];
  summary: string | null;
  confident: boolean;
  sources: string[];
}

/**
 * 회사명을 웹에서 조사해 업종·역량 태그를 제안한다.
 *
 * 자동 저장하지 않는다 — 동명 회사로 오답이 날 수 있어 사용자가 태그를
 * 하나씩 골라 담게 한다. 수동 입력(폼의 업종·태그 칸)은 그대로 쓸 수 있다.
 */
export function EnrichPanel({
  cardId,
  company,
  currentIndustry,
  currentCapabilities,
  onApply,
}: {
  cardId: string;
  company: string | null;
  currentIndustry: string | null;
  currentCapabilities: string[];
  /** 고른 값을 폼 드래프트에 반영한다 (저장은 기존 저장 버튼으로) */
  onApply: (patch: { industry?: string; capabilities?: string[] }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EnrichSuggestion | null>(null);

  async function search() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/cards/${cardId}/enrich`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "조사에 실패했습니다.");
        return;
      }
      setResult(json as EnrichSuggestion);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  // 제안 태그는 담아도 목록에서 빼지 않는다 — 빼버리면 화면 위쪽 칩 영역이
  // 보이지 않는 상태에서 누른 사용자에게 "적용됐다"는 신호가 남지 않는다.
  const suggested = result?.capabilities ?? [];
  const appliedCount = suggested.filter((t) => currentCapabilities.includes(t)).length;

  function toggleTag(tag: string) {
    onApply({
      capabilities: currentCapabilities.includes(tag)
        ? currentCapabilities.filter((t) => t !== tag)
        : [...currentCapabilities, tag],
    });
  }

  return (
    <section className="mt-6 space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">웹에서 회사 정보 찾기</h2>
          <p className="mt-0.5 text-xs text-soft">
            명함에 없는 업종·취급품목을 검색해 채웁니다. 확인 후 적용하세요.
          </p>
        </div>
        <button
          onClick={search}
          disabled={busy || !company?.trim()}
          className="shrink-0 rounded-xl bg-brand px-3.5 py-2 text-xs font-semibold text-brand-ink disabled:opacity-50"
        >
          {busy ? "검색 중…" : "검색"}
        </button>
      </div>

      {!company?.trim() && (
        <p className="text-xs text-faint">회사명을 먼저 입력해야 검색할 수 있습니다.</p>
      )}

      {busy && (
        <p className="flex items-center gap-2 text-xs text-soft">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          웹을 뒤지는 중… 20~40초 걸릴 수 있습니다
        </p>
      )}

      {error && (
        <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-xs text-danger">{error}</p>
      )}

      {result && (
        <div className="space-y-3 border-t border-line pt-3">
          {!result.confident && (
            <p className="rounded-xl bg-warn-soft px-3.5 py-2.5 text-xs text-warn">
              회사를 특정하지 못했습니다. 동명 회사일 수 있으니 그대로 쓰지 말고
              직접 확인하세요.
            </p>
          )}

          {result.summary && <p className="text-sm text-soft">{result.summary}</p>}

          {result.industry && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">
                업종: <span className="font-medium">{result.industry}</span>
              </span>
              {result.industry === currentIndustry ? (
                <span className="shrink-0 rounded-lg bg-ok-soft px-2.5 py-1 text-xs font-semibold text-ok">
                  적용됨 ✓
                </span>
              ) : (
                <button
                  onClick={() => onApply({ industry: result.industry! })}
                  className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs font-medium"
                >
                  업종 적용
                </button>
              )}
            </div>
          )}

          {suggested.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-soft">
                  제안 태그{" "}
                  <span className="font-normal text-faint">— 눌러서 담기/빼기</span>
                </span>
                <button
                  onClick={() =>
                    onApply({
                      capabilities: [...new Set([...currentCapabilities, ...suggested])],
                    })
                  }
                  className="text-xs font-medium text-brand"
                >
                  전부 담기
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {suggested.map((tag) => {
                  const on = currentCapabilities.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      aria-pressed={on}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                        on
                          ? "bg-brand text-brand-ink"
                          : "border border-brand/30 bg-brand-soft text-brand"
                      }`}
                    >
                      {on ? `${tag} ✓` : `+ ${tag}`}
                    </button>
                  );
                })}
              </div>
              {appliedCount > 0 && (
                <p className="rounded-lg bg-ok-soft px-3 py-2 text-xs font-medium text-ok">
                  {appliedCount}개 담았습니다. 아래 <strong>변경사항 저장</strong>을 눌러야
                  실제로 반영됩니다.
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-faint">제안할 태그를 찾지 못했습니다.</p>
          )}

          {result.sources.length > 0 && (
            <details className="text-xs text-faint">
              <summary className="cursor-pointer">출처 {result.sources.length}건</summary>
              <ul className="mt-1.5 space-y-1">
                {result.sources.slice(0, 8).map((url) => (
                  <li key={url} className="truncate">
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand underline"
                    >
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}

        </div>
      )}
    </section>
  );
}
