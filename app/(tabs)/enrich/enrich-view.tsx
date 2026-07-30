"use client";

import Link from "next/link";
import { Check, CircleAlert, CircleHelp, ExternalLink, Pause, Play, RotateCcw, Search } from "lucide-react";
import type { EnrichSuggestion } from "@/components/enrich-panel";
import { Action, Chip, Progress, StateBlock, StatusBadge, Surface } from "@/components/ui";

export const ENRICH_FILTERS = ["all", "waiting", "review", "failed", "applied"] as const;
export type EnrichFilter = (typeof ENRICH_FILTERS)[number];
export type EnrichStatus = "waiting" | "searching" | "ready" | "failed" | "applied";

export interface EnrichViewRow {
  readonly company: string;
  readonly missing: number;
  readonly total: number;
  readonly status: EnrichStatus;
  readonly suggestion: EnrichSuggestion | null;
  readonly picked: readonly string[];
  readonly error: string | null;
  readonly updated: number;
}

export interface EnrichViewProps {
  readonly rows: readonly EnrichViewRow[];
  readonly running: boolean;
  readonly stoppedCode: string | null;
  readonly filter: EnrichFilter;
  readonly onFilterChange: (filter: EnrichFilter) => void;
  readonly onStart: () => void;
  readonly onStop: () => void;
  readonly onRetryFailed: () => void;
  readonly onToggle: (row: EnrichViewRow, tag: string) => void;
  readonly onApply: (row: EnrichViewRow) => void;
}

const STOP_COPY: Record<string, string> = {
  provider_unconfigured: "서버 OpenAI API가 설정되지 않아 여기서 멈췄습니다. 설정에서 사용 가능한 검색 제공자를 확인하세요.",
  rate_limited: "검색 제공자의 사용량 제한으로 멈췄습니다. 실패한 회사만 나중에 다시 시도하세요.",
  auth_expired: "연결된 인증이 만료되어 멈췄습니다. 설정에서 해당 제공자를 다시 연결하세요.",
};

function filterLabel(filter: EnrichFilter): string {
  switch (filter) {
    case "all": return "전체";
    case "waiting": return "대기";
    case "review": return "검토 필요";
    case "failed": return "실패";
    case "applied": return "적용됨";
  }
}

function visibleRows(rows: readonly EnrichViewRow[], filter: EnrichFilter): readonly EnrichViewRow[] {
  if (filter === "all") return rows;
  if (filter === "review") return rows.filter((row) => row.status === "ready");
  return rows.filter((row) => row.status === filter);
}

function statusTone(status: EnrichStatus): "neutral" | "brand" | "success" | "warning" | "danger" {
  switch (status) {
    case "waiting": return "neutral";
    case "searching": return "brand";
    case "ready": return "warning";
    case "failed": return "danger";
    case "applied": return "success";
  }
}

function statusLabel(status: EnrichStatus): string {
  switch (status) {
    case "waiting": return "대기";
    case "searching": return "검색 중";
    case "ready": return "검토 필요";
    case "failed": return "실패";
    case "applied": return "적용됨";
  }
}

function processed(row: EnrichViewRow): boolean {
  return row.status === "ready" || row.status === "failed" || row.status === "applied";
}

export function EnrichView({
  rows,
  running,
  stoppedCode,
  filter,
  onFilterChange,
  onStart,
  onStop,
  onRetryFailed,
  onToggle,
  onApply,
}: EnrichViewProps) {
  if (rows.length === 0) {
    return (
      <StateBlock
        state="empty"
        title="보강할 회사가 없습니다"
        description="모든 명함에 회사 역량 태그가 채워져 있습니다."
        action={<Link className="ui-action ui-action-secondary" href="/">홈으로</Link>}
      />
    );
  }

  const processedCount = rows.filter(processed).length;
  const failedCount = rows.filter((row) => row.status === "failed").length;
  const reviewCount = rows.filter((row) => row.status === "ready").length;
  const visible = visibleRows(rows, filter);
  const allDone = processedCount === rows.length;

  return (
    <div className="grid gap-5 pb-safe-nav lg:grid-cols-[19rem_minmax(0,1fr)] lg:items-start lg:gap-6">
      <div className="space-y-4 lg:sticky lg:top-6">
      <Surface variant="tinted" className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">회사 보강</p>
            <h2 className="mt-1 text-lg font-semibold">검색 진행 상황</h2>
            <p className="mt-1 text-sm text-soft">검색 결과는 저장 전 검토하고, 선택한 태그만 적용합니다.</p>
          </div>
          <StatusBadge className="shrink-0 whitespace-nowrap" tone={allDone ? "success" : running ? "brand" : "neutral"}>
            {processedCount}/{rows.length} 처리됨
          </StatusBadge>
        </div>
        <Progress label={`${processedCount}개 회사 확인`} value={processedCount} max={rows.length} />
        <div className="flex flex-wrap gap-2">
          {running ? (
            <Action variant="secondary" icon={<Pause aria-hidden="true" className="size-4" />} onClick={onStop}>
              중지
            </Action>
          ) : (
            <Action
              icon={allDone ? <Check aria-hidden="true" className="size-4" /> : <Play aria-hidden="true" className="size-4" />}
              onClick={onStart}
              disabled={allDone}
            >
              {allDone ? "검색 완료" : "검색 계속하기"}
            </Action>
          )}
          {failedCount > 0 ? (
            <Action variant="secondary" icon={<RotateCcw aria-hidden="true" className="size-4" />} onClick={onRetryFailed} disabled={running}>
              실패한 {failedCount}개만 재시도
            </Action>
          ) : null}
        </div>
      </Surface>

      {stoppedCode ? (
        <div role="alert" className="flex gap-3 rounded-xl border border-warn/30 bg-warn-soft p-4 text-sm text-warn">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">검색을 잠시 멈췄습니다</p>
            <p className="mt-1">{STOP_COPY[stoppedCode] ?? "검색을 멈췄습니다. 남은 회사는 변경되지 않았습니다."}</p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2" aria-label="보강 상태 필터">
        {ENRICH_FILTERS.map((option) => (
          <Chip key={option} selected={filter === option} onClick={() => onFilterChange(option)}>
            {filterLabel(option)}
            <span className="ml-1 text-xs opacity-75">
              {option === "all" ? rows.length : option === "review" ? reviewCount : rows.filter((row) => row.status === option).length}
            </span>
          </Chip>
        ))}
      </div>
      </div>

      <section className="min-w-0">
      {visible.length === 0 ? (
        <StateBlock state="info" title="이 상태의 회사가 없습니다" description="다른 필터를 선택해 전체 진행 상황을 확인하세요." />
      ) : (
        <div className="space-y-3">
          {visible.map((row) => (
            <EnrichRow key={row.company} row={row} onToggle={onToggle} onApply={onApply} />
          ))}
        </div>
      )}
      </section>
    </div>
  );
}

function EnrichRow({
  row,
  onToggle,
  onApply,
}: Readonly<Pick<EnrichViewProps, "onToggle" | "onApply"> & { row: EnrichViewRow }>) {
  const suggestion = row.suggestion;
  const suggested = suggestion?.capabilities ?? [];
  const picked = new Set(row.picked);
  const canApply = row.status === "ready" && row.picked.length > 0;

  return (
    <Surface variant="slip" className="space-y-3 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-base font-semibold [word-break:keep-all]">{row.company}</h3>
          <p className="mt-1 text-sm text-soft">명함 {row.total}장 중 {row.missing}장에 태그 없음</p>
        </div>
        <StatusBadge className="shrink-0 whitespace-nowrap" tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusBadge>
      </div>

      {row.error ? <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{row.error}</p> : null}
      {row.status === "searching" ? (
        <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-soft">
          <Search aria-hidden="true" className="ui-spinner size-4 text-brand" />
          이 회사의 공식 정보를 찾는 중입니다.
        </div>
      ) : null}

      {suggestion ? (
        <div className="space-y-3 border-t border-line pt-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-soft">
            <StatusBadge className="whitespace-nowrap" tone={suggestion.confident ? "success" : "warning"}>
              {suggestion.confident ? "회사 특정 확실" : "동명 회사 확인 필요"}
            </StatusBadge>
            <span>{suggestion.sources.length}개 출처 확인</span>
          </div>
          {!suggestion.confident ? (
            <p className="flex gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
              <CircleHelp aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              검색 결과가 같은 이름의 회사를 구분하지 못했습니다. 태그를 직접 확인하세요.
            </p>
          ) : null}
          {suggestion.summary ? <p className="text-sm text-soft">{suggestion.summary}</p> : null}
          {suggested.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {suggested.map((tag) => (
                <Chip key={tag} selected={picked.has(tag)} onClick={() => onToggle(row, tag)}>
                  {picked.has(tag) ? <Check aria-hidden="true" className="size-4" /> : null}{tag}
                </Chip>
              ))}
            </div>
          ) : <p className="text-sm text-faint">제안할 태그를 찾지 못했습니다.</p>}
          {canApply ? (
            <Action onClick={() => onApply(row)} icon={<Check aria-hidden="true" className="size-4" />}>
              선택한 {row.picked.length}개 태그 적용
            </Action>
          ) : null}
          {row.status === "applied" ? <p className="rounded-lg bg-ok-soft px-3 py-2 text-sm font-medium text-ok">명함 {row.updated}장에 적용했습니다.</p> : null}
          {suggestion.sources.length > 0 ? (
            <details className="text-sm">
              <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-medium text-brand">출처 {suggestion.sources.length}건 보기</summary>
              <ul className="space-y-1.5 pt-2">
                {suggestion.sources.map((source) => (
                  <li key={source.url} className="flex min-w-0 gap-2">
                    <ExternalLink aria-hidden="true" className="mt-1 size-4 shrink-0 text-soft" />
                    <a href={source.url} target="_blank" rel="noreferrer" className="min-w-0 break-words text-brand underline underline-offset-2 [word-break:keep-all]">{source.title || source.url}</a>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </Surface>
  );
}

export { filterLabel, visibleRows };
