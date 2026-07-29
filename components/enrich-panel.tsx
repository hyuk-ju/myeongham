"use client";

import { useState } from "react";

export interface EnrichSuggestion {
  industry: string | null;
  capabilities: string[];
  summary: string | null;
  confident: boolean;
  sources: string[];
}

export interface EnrichSubject {
  company: string | null;
  company_en: string | null;
  website: string | null;
  address: string | null;
  tax_code: string | null;
}

/**
 * 회사명을 웹에서 조사해 업종·역량 태그를 제안한다.
 *
 * 촬영 화면(저장 전)과 상세 화면(저장 후) 양쪽에서 쓴다. 그래서 카드 ID 가
 * 아니라 폼에 들어있는 값을 그대로 받는다 — 사용자가 회사명을 고쳤다면 고친
 * 값으로 검색된다.
 *
 * 결과를 확신하는 경우에는 태그를 미리 담아 둔다. 하나씩 누르게 하면 손이 너무
 * 많이 가기 때문이다. 대신 잘못 담긴 것은 눌러서 뺄 수 있고, 확신하지 못한
 * 결과는 담지 않고 사용자가 직접 고르게 한다.
 */
export function EnrichPanel({
  subject,
  currentIndustry,
  currentCapabilities,
  onApply,
  initial = null,
}: {
  subject: EnrichSubject;
  /**
   * 대기열에서 미리 받아둔 제안. 있으면 검색 버튼을 누르지 않아도 바로 보인다.
   * 자동으로 담지는 않는다 — 고르는 건 항상 사용자다.
   */
  initial?: EnrichSuggestion | null;
  currentIndustry: string | null;
  currentCapabilities: string[];
  /**
   * 고른 값을 폼 드래프트에 반영한다 (저장은 각 화면의 저장 버튼으로).
   *
   * fromWeb 은 capabilities_source 를 정하는 데 쓴다. 이 패널에서 나온 태그만
   * 'web' 이다 — 같은 회사 카드에서 복사한 태그까지 'web' 으로 찍히면 근거가
   * 틀려진다.
   */
  onApply: (patch: {
    industry?: string;
    capabilities?: string[];
    fromWeb?: boolean;
  }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EnrichSuggestion | null>(initial);
  const [autoApplied, setAutoApplied] = useState(0);

  async function search() {
    setBusy(true);
    setError(null);
    setResult(null);
    setAutoApplied(0);
    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subject),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "조사에 실패했습니다.");
        return;
      }
      const suggestion = json as EnrichSuggestion;
      setResult(suggestion);

      // 확신하는 결과만 미리 담는다.
      // (search 는 이벤트 핸들러라 이 시점의 props 가 최신이다)
      if (suggestion.confident) {
        const merged = [...new Set([...currentCapabilities, ...suggestion.capabilities])];
        onApply({
          capabilities: merged,
          fromWeb: true,
          ...(suggestion.industry && !currentIndustry
            ? { industry: suggestion.industry }
            : {}),
        });
        setAutoApplied(merged.length - currentCapabilities.length);
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const suggested = result?.capabilities ?? [];
  const appliedCount = suggested.filter((t) => currentCapabilities.includes(t)).length;
  const allApplied = suggested.length > 0 && appliedCount === suggested.length;

  function toggleTag(tag: string) {
    onApply({
      fromWeb: true,
      capabilities: currentCapabilities.includes(tag)
        ? currentCapabilities.filter((t) => t !== tag)
        : [...currentCapabilities, tag],
    });
  }

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">웹에서 회사 정보 찾기</h2>
          <p className="mt-0.5 text-xs text-soft">
            명함에 없는 업종·취급품목을 검색해 채웁니다.
          </p>
        </div>
        <button
          type="button"
          onClick={search}
          disabled={busy || !subject.company?.trim()}
          className="shrink-0 rounded-xl bg-brand px-3.5 py-2 text-xs font-semibold text-brand-ink disabled:opacity-50"
        >
          {busy ? "검색 중…" : result ? "다시 검색" : "검색"}
        </button>
      </div>

      {!subject.company?.trim() && (
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
              회사를 특정하지 못했습니다. 동명 회사일 수 있으니 확인 후 직접 담으세요.
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
                  type="button"
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
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-soft">
                  제안 태그{" "}
                  <span className="font-normal text-faint">— 눌러서 담기/빼기</span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onApply({
                      fromWeb: true,
                      capabilities: allApplied
                        ? currentCapabilities.filter((t) => !suggested.includes(t))
                        : [...new Set([...currentCapabilities, ...suggested])],
                    })
                  }
                  className="shrink-0 text-xs font-medium text-brand"
                >
                  {allApplied ? "전부 빼기" : "전부 담기"}
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {suggested.map((tag) => {
                  const on = currentCapabilities.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
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

              {autoApplied > 0 ? (
                <p className="rounded-lg bg-ok-soft px-3 py-2 text-xs font-medium text-ok">
                  {autoApplied}개를 자동으로 담았습니다. 필요 없는 것은 눌러서 빼세요.
                  아래 저장을 눌러야 반영됩니다.
                </p>
              ) : (
                appliedCount > 0 && (
                  <p className="rounded-lg bg-ok-soft px-3 py-2 text-xs font-medium text-ok">
                    {appliedCount}개 담았습니다. 아래 저장을 눌러야 반영됩니다.
                  </p>
                )
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
