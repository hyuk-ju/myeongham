"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EnrichView, type EnrichFilter, type EnrichViewRow, type EnrichStatus } from "./enrich-view";
import type { EnrichSuggestion } from "@/components/enrich-panel";

export interface CompanyNeed {
  readonly company: string;
  readonly missing: number;
  readonly total: number;
}

type Row = EnrichViewRow;

const STOP_CODES = new Set(["provider_unconfigured", "rate_limited", "auth_expired"]);

function errorCode(payload: unknown): string {
  if (typeof payload !== "object" || payload === null || !("code" in payload)) return "upstream_failure";
  const code = payload.code;
  return typeof code === "string" ? code : "upstream_failure";
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function parseSuggestion(payload: unknown): EnrichSuggestion | null {
  const candidate = isRecord(payload) && "suggestion" in payload ? payload.suggestion : payload;
  if (!isRecord(candidate)) return null;
  const capabilities = candidate.capabilities;
  const sources = candidate.sources;
  if (
    !(typeof candidate.industry === "string" || candidate.industry === null) ||
    !(typeof candidate.summary === "string" || candidate.summary === null) ||
    typeof candidate.confident !== "boolean" ||
    !Array.isArray(capabilities) ||
    !capabilities.every((tag): tag is string => typeof tag === "string") ||
    !Array.isArray(sources) ||
    !sources.every((source) => isRecord(source) && typeof source.url === "string" && typeof source.title === "string")
  ) return null;
  return {
    industry: candidate.industry,
    capabilities,
    summary: candidate.summary,
    confident: candidate.confident,
    sources: sources.map((source) => ({ url: source.url, title: source.title })),
  };
}

export function EnrichClient({ companies }: Readonly<{ companies: readonly CompanyNeed[] }>) {
  const [rows, setRows] = useState<readonly Row[]>(() => companies.map((company) => ({ ...company, status: "waiting" as const, suggestion: null, picked: [], error: null, updated: 0 })));
  const [running, setRunning] = useState(false);
  const [stoppedCode, setStoppedCode] = useState<string | null>(null);
  const [filter, setFilter] = useState<EnrichFilter>("all");
  const rowsRef = useRef(rows);
  const alive = useRef(true);
  const stopped = useRef(false);
  const retryOnly = useRef(false);
  const retryTargets = useRef<ReadonlySet<string>>(new Set());
  const activeCompany = useRef<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);

  const publish = useCallback((next: readonly Row[]) => {
    rowsRef.current = next;
    if (alive.current) setRows(next);
  }, []);

  const patch = useCallback((company: string, changes: Partial<Row>) => {
    publish(rowsRef.current.map((row) => row.company === company ? { ...row, ...changes } : row));
  }, [publish]);

  const search = useCallback(async () => {
    if (running) return;
    setRunning(true);
    stopped.current = false;
    setStoppedCode(null);
    try {
      while (alive.current && !stopped.current) {
        const next = rowsRef.current.find((row) => row.status === "waiting" && (!retryOnly.current || retryTargets.current.has(row.company)));
        if (!next) break;
        activeCompany.current = next.company;
        patch(next.company, { status: "searching", error: null });
        const requestController = new AbortController();
        controller.current = requestController;
        try {
          const response = await fetch("/api/enrich", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ company: next.company }),
            signal: requestController.signal,
          });
          const payload: unknown = await response.json();
          if (!response.ok) {
            const code = errorCode(payload);
            patch(next.company, { status: "failed", error: code });
            if (STOP_CODES.has(code)) {
              stopped.current = true;
              if (alive.current) setStoppedCode(code);
            }
          } else {
            const suggestion = parseSuggestion(payload);
            patch(next.company, suggestion ? {
              status: "ready",
              suggestion,
              picked: [],
              error: null,
            } : { status: "failed", error: "invalid_response" });
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            if (!stopped.current) patch(next.company, { status: "waiting" });
          } else {
            patch(next.company, { status: "failed", error: "upstream_failure" });
          }
        } finally {
          controller.current = null;
          activeCompany.current = null;
        }
      }
    } finally {
      retryOnly.current = false;
      retryTargets.current = new Set();
      if (alive.current) setRunning(false);
    }
  }, [patch, running]);

  const stop = useCallback(() => {
    stopped.current = true;
    controller.current?.abort();
    const company = activeCompany.current;
    if (company) patch(company, { status: "waiting", error: null });
    setStoppedCode("stopped");
    setRunning(false);
  }, [patch]);

  const retryFailed = useCallback(() => {
    const failed = new Set(rowsRef.current.filter((row) => row.status === "failed").map((row) => row.company));
    retryTargets.current = failed;
    retryOnly.current = failed.size > 0;
    publish(rowsRef.current.map((row) => row.status === "failed" ? { ...row, status: "waiting" as EnrichStatus, error: null } : row));
    setStoppedCode(null);
  }, [publish]);

  const toggle = useCallback((row: Row, tag: string) => {
    const picked = row.picked.includes(tag) ? row.picked.filter((item) => item !== tag) : [...row.picked, tag];
    patch(row.company, { picked });
  }, [patch]);

  const apply = useCallback(async (row: Row) => {
    if (!row.picked.length) return;
    const response = await fetch("/api/cards/bulk-capabilities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company: row.company, capabilities: row.picked, industry: row.suggestion?.industry ?? null }),
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      patch(row.company, { error: errorCode(payload) });
      return;
    }
    const updated = typeof payload === "object" && payload !== null && "updated" in payload && typeof payload.updated === "number" ? payload.updated : 0;
    patch(row.company, { status: "applied", updated, error: null });
  }, [patch]);

  return (
    <EnrichView
      rows={rows}
      running={running}
      stoppedCode={stoppedCode}
      filter={filter}
      onFilterChange={setFilter}
      onStart={search}
      onStop={stop}
      onRetryFailed={retryFailed}
      onToggle={toggle}
      onApply={apply}
    />
  );
}
