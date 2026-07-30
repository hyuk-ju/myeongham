"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink, Search } from "lucide-react";
import { Action, Chip } from "@/components/ui";

export interface EnrichSuggestion {
  readonly industry: string | null;
  readonly capabilities: readonly string[];
  readonly summary: string | null;
  readonly confident: boolean;
  readonly sources: readonly { readonly url: string; readonly title: string }[];
}

export interface EnrichSubject {
  company: string | null;
  company_en: string | null;
  website: string | null;
  address: string | null;
  tax_code: string | null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function parseSuggestion(value: unknown): EnrichSuggestion | null {
  if (!isRecord(value)) return null;
  const capabilities = value.capabilities;
  const sources = value.sources;
  if (
    !(typeof value.industry === "string" || value.industry === null) || !(typeof value.summary === "string" || value.summary === null) ||
    typeof value.confident !== "boolean" ||
    !Array.isArray(capabilities) ||
    !capabilities.every((tag): tag is string => typeof tag === "string") ||
    !Array.isArray(sources) ||
    !sources.every((source) => isRecord(source) && typeof source.url === "string" && typeof source.title === "string")
  ) return null;
  return {
    industry: value.industry,
    capabilities,
    summary: value.summary, confident: value.confident,
    sources: sources.map((source) => ({ url: source.url, title: source.title })),
  };
}

function responseError(value: unknown): string {
  return isRecord(value) && typeof value.code === "string" ? value.code : "upstream_failure";
}

/**
 * 회사명을 웹에서 조사해 업종·역량 태그를 제안한다.
 *
 * 촬영 화면(저장 전)과 상세 화면(저장 후) 양쪽에서 쓴다. 그래서 카드 ID 가
 * 아니라 폼에 들어있는 값을 그대로 받는다 — 사용자가 회사명을 고쳤다면 고친
 * 값으로 검색된다.
 *
 * 검색 결과는 태그를 자동으로 반영하지 않는다. 사용자가 출처와 확신도를 확인한
 * 뒤 직접 고른 값만 폼 드래프트에 담고, 최종 저장은 각 화면이 담당한다.
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

  async function search() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subject),
      });
      const json: unknown = await res.json();
      if (!res.ok) { setError(responseError(json)); return; }
      const suggestion = parseSuggestion(json);
      if (!suggestion) {
        setError("invalid_response");
        return;
      }
      setResult(suggestion);
    } catch {
      setError("upstream_failure");
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
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-3 shadow-sm sm:p-4">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 [word-break:keep-all]">
          <h2 className="text-xs font-semibold sm:text-sm">웹에서 회사 정보 찾기</h2>
          <p className="mt-0.5 text-[11px] text-soft sm:text-xs">명함에 없는 업종·취급품목을 검색해 채웁니다.</p>
        </div>
        <Action
          onClick={search}
          disabled={busy || !subject.company?.trim()}
          loading={busy}
          icon={<Search aria-hidden="true" className="size-4" />}
          className="w-full shrink-0 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 sm:w-auto"
        >
          {result ? "다시 검색" : "검색"}
        </Action>
      </div>

      {!subject.company?.trim() && (
        <p className="text-xs text-faint">회사명을 먼저 입력해야 검색할 수 있습니다.</p>
      )}

      {busy && (
        <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-soft">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          웹을 뒤지는 중… 20~40초 걸릴 수 있습니다
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</p>
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
                <Action
                  variant="secondary"
                  onClick={() => {
                    if (result.industry) onApply({ industry: result.industry });
                  }}
                  className="shrink-0 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
                >
                  업종 적용
                </Action>
              )}
            </div>
          )}

          {suggested.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-soft">
                  제안 태그{" "}
                  <span className="font-normal text-soft">— 눌러서 담기/빼기</span>
                </span>
                <Action
                  variant="quiet"
                  onClick={() =>
                    onApply({
                      fromWeb: true,
                      capabilities: allApplied
                        ? currentCapabilities.filter((t) => !suggested.includes(t))
                        : [...new Set([...currentCapabilities, ...suggested])],
                    })
                  }
                  className="shrink-0 text-sm text-brand focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
                >
                  {allApplied ? "전부 빼기" : "전부 담기"}
                </Action>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {suggested.map((tag) => {
                  const on = currentCapabilities.includes(tag);
                  return <Chip key={tag} selected={on} onClick={() => toggleTag(tag)}>{on ? `✓ ${tag}` : `+ ${tag}`}</Chip>;
                })}
              </div>

              {appliedCount > 0 && (
                <p className="rounded-lg bg-ok-soft px-3 py-2 text-xs font-medium text-ok">
                  {appliedCount}개를 선택했습니다. 아래 저장을 눌러야 반영됩니다.
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-faint">제안할 태그를 찾지 못했습니다.</p>
          )}

          {result.sources.length > 0 && (
            <details className="text-xs text-faint">
              <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium text-brand focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"><ChevronDown aria-hidden="true" className="size-4" />출처 {result.sources.length}건 보기</summary>
              <ul className="mt-1.5 space-y-1">
                {result.sources.slice(0, 8).map((source) => (
                  <li key={source.url} className="min-w-0">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-h-11 min-w-0 items-center gap-2 break-words text-brand underline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 [word-break:keep-all]"
                    >
                      <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
                      {source.title || source.url}
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
