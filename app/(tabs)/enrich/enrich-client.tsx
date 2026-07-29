"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { EnrichSuggestion } from "@/components/enrich-panel";

export interface CompanyNeed {
  company: string;
  missing: number;
  total: number;
}

type Status = "waiting" | "searching" | "ready" | "failed" | "applied";

interface Row extends CompanyNeed {
  status: Status;
  suggestion: EnrichSuggestion | null;
  picked: string[];
  error: string | null;
  updated: number;
}

/**
 * 일괄 보강 — 역량 태그가 빈 명함을 회사 단위로 채운다.
 *
 * 태그가 없는 명함은 질문에 안 걸려서 사실상 없는 명함이 된다. 등록할 때
 * 건너뛰었거나 검색이 실패한 것들을 여기서 한 번에 정리한다.
 *
 * 검색은 **한 번에 하나씩** 돈다 — 구독 OAuth 에 429 재시도 계층이 없어서
 * 동시에 부르면 한도만 빨리 태운다. 적용은 자동으로 하지 않는다.
 */
export function EnrichClient({ companies }: { companies: CompanyNeed[] }) {
  const [rows, setRows] = useState<Row[]>(() =>
    companies.map((c) => ({
      ...c,
      status: "waiting" as Status,
      suggestion: null,
      picked: [],
      error: null,
      updated: 0,
    })),
  );
  const [running, setRunning] = useState(false);
  const [stopped, setStopped] = useState<string | null>(null);

  const listRef = useRef<Row[]>(rows);
  const alive = useRef(true);
  const stoppedRef = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const publish = useCallback((next: Row[]) => {
    listRef.current = next;
    if (alive.current) setRows(next);
  }, []);

  const patch = useCallback(
    (company: string, next: Partial<Row>) => {
      publish(listRef.current.map((r) => (r.company === company ? { ...r, ...next } : r)));
    },
    [publish],
  );

  async function searchAll() {
    if (running) return;
    setRunning(true);
    stoppedRef.current = false;
    setStopped(null);

    try {
      for (;;) {
        if (!alive.current || stoppedRef.current) break;
        const next = listRef.current.find((r) => r.status === "waiting");
        if (!next) break;

        patch(next.company, { status: "searching", error: null });
        try {
          const res = await fetch("/api/enrich", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ company: next.company }),
          });
          const json = await res.json();

          if (!res.ok) {
            const stop =
              typeof json.error === "string" &&
              (json.error.includes("사용량 한도") || json.error.includes("인증이 만료"));
            patch(next.company, { status: "failed", error: json.error ?? "검색 실패" });
            if (stop) {
              stoppedRef.current = true;
              if (alive.current) setStopped(json.error);
            }
            continue;
          }

          const suggestion = json as EnrichSuggestion;
          patch(next.company, {
            status: "ready",
            suggestion,
            // 회사를 특정했다고 한 경우에만 미리 골라둔다. 적용은 사용자가 누른다.
            picked: suggestion.confident ? suggestion.capabilities : [],
          });
        } catch {
          patch(next.company, { status: "failed", error: "네트워크 오류" });
        }
      }
    } finally {
      if (alive.current) setRunning(false);
    }
  }

  async function apply(row: Row) {
    if (!row.picked.length) return;
    const res = await fetch("/api/cards/bulk-capabilities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: row.company,
        capabilities: row.picked,
        industry: row.suggestion?.industry ?? null,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      patch(row.company, { error: json.error ?? "적용에 실패했습니다." });
      return;
    }
    patch(row.company, { status: "applied", updated: json.updated ?? 0, error: null });
  }

  function toggle(row: Row, tag: string) {
    patch(row.company, {
      picked: row.picked.includes(tag)
        ? row.picked.filter((t) => t !== tag)
        : [...row.picked, tag],
    });
  }

  if (!rows.length) {
    return (
      <div className="space-y-4 rounded-2xl border border-line bg-surface p-5 text-center shadow-sm">
        <p className="text-sm text-soft">역량 태그가 빠진 명함이 없습니다.</p>
        <Link
          href="/"
          className="inline-block rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-ink"
        >
          홈으로
        </Link>
      </div>
    );
  }

  const waiting = rows.filter((r) => r.status === "waiting").length;

  return (
    <div className="space-y-4 pb-24">
      <p className="rounded-xl bg-brand-soft px-3.5 py-2.5 text-sm text-brand">
        태그가 빠진 명함이 <strong className="font-semibold">{rows.length}개 회사</strong>에
        있습니다. 웹에서 찾은 태그는 <strong className="font-semibold">고른 것만</strong>{" "}
        그 회사 명함 전체에 적용됩니다.
      </p>

      {stopped && (
        <p className="rounded-xl bg-warn-soft px-3.5 py-2.5 text-sm text-warn">{stopped}</p>
      )}

      {waiting > 0 && (
        <button
          type="button"
          onClick={searchAll}
          disabled={running}
          className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-ink disabled:opacity-60"
        >
          {running ? "검색 중… (한 곳씩)" : `${waiting}개 회사 웹에서 찾기`}
        </button>
      )}

      <div className="space-y-3">
        {rows.map((row) => (
          <section
            key={row.company}
            className="space-y-2.5 rounded-2xl border border-line bg-surface p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">{row.company}</h2>
                <p className="mt-0.5 text-xs text-soft">
                  명함 {row.total}장 중 {row.missing}장에 태그 없음
                </p>
              </div>
              <StatusBadge row={row} />
            </div>

            {row.error && <p className="text-xs text-danger">{row.error}</p>}

            {row.suggestion?.summary && (
              <p className="text-xs text-soft">{row.suggestion.summary}</p>
            )}

            {row.status === "ready" && row.suggestion && (
              <>
                {row.suggestion.confident === false && (
                  <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
                    회사를 특정하지 못했습니다. 동명 회사일 수 있으니 확인 후 고르세요.
                  </p>
                )}

                {row.suggestion.capabilities.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {row.suggestion.capabilities.map((tag) => {
                      const on = row.picked.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggle(row, tag)}
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
                ) : (
                  <p className="text-xs text-faint">제안할 태그를 찾지 못했습니다.</p>
                )}

                {row.picked.length > 0 && (
                  <button
                    type="button"
                    onClick={() => apply(row)}
                    className="rounded-xl bg-brand px-3.5 py-2 text-xs font-semibold text-brand-ink"
                  >
                    {row.picked.length}개를 {row.company} 명함 {row.total}장에 적용
                  </button>
                )}
              </>
            )}

            {row.status === "applied" && (
              <p className="rounded-lg bg-ok-soft px-3 py-2 text-xs font-medium text-ok">
                명함 {row.updated}장에 적용했습니다.
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ row }: { row: Row }) {
  if (row.status === "searching") {
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-soft">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        찾는 중
      </span>
    );
  }
  const map: Record<Status, { text: string; cls: string } | null> = {
    waiting: { text: "대기", cls: "bg-surface-hover text-soft" },
    searching: null,
    ready: { text: "선택 대기", cls: "bg-brand-soft text-brand" },
    failed: { text: "실패", cls: "bg-danger-soft text-danger" },
    applied: { text: "적용됨", cls: "bg-ok-soft text-ok" },
  };
  const badge = map[row.status];
  if (!badge) return null;
  return (
    <span className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold ${badge.cls}`}>
      {badge.text}
    </span>
  );
}
