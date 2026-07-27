"use client";

import { useState } from "react";
import Link from "next/link";

interface AskRow {
  card_id: string | null;
  company: string | null;
  name: string | null;
  title: string | null;
  phone: string | null;
  email: string | null;
  why: string | null;
}

interface AskResult {
  rows: AskRow[];
  note: string | null;
  candidateCount: number;
}

const EXAMPLES = [
  "정밀가공 되는 회사 담당자 연락처",
  "사출금형 만드는 회사 알려줘",
  "작년에 전시회에서 만난 사람",
];

export function AskClient() {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResult | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function ask(q: string) {
    const trimmed = q.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setAsked(trimmed);
    setCopied(false);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "질의에 실패했습니다.");
        return;
      }
      setResult(json as AskResult);
    } catch {
      setError("네트워크 오류가 발생했습니다. 다시 시도하세요.");
    } finally {
      setBusy(false);
    }
  }

  function toTsv(rows: AskRow[]): string {
    const header = ["회사", "이름", "직함", "전화", "이메일", "근거"];
    const lines = rows.map((r) =>
      [r.company, r.name, r.title, r.phone, r.email, r.why]
        .map((v) => (v ?? "").replaceAll("\t", " ").replaceAll("\n", " "))
        .join("\t"),
    );
    return [header.join("\t"), ...lines].join("\n");
  }

  async function copyTable() {
    if (!result?.rows.length) return;
    await navigator.clipboard.writeText(toTsv(result.rows));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadCsv() {
    if (!result?.rows.length) return;
    const esc = (v: string | null) => `"${(v ?? "").replaceAll('"', '""')}"`;
    const header = ["회사", "이름", "직함", "전화", "이메일", "근거"].join(",");
    const lines = result.rows.map((r) =>
      [r.company, r.name, r.title, r.phone, r.email, r.why].map(esc).join(","),
    );
    // 엑셀 한글 호환을 위한 BOM
    const blob = new Blob(["﻿" + [header, ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "명함검색결과.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-3 shadow-sm">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(question);
              }
            }}
            rows={2}
            placeholder="예: A 설비를 만들 수 있는 회사와 담당자 연락처 정리해줘"
            className="max-h-40 w-full resize-none bg-transparent px-1 py-1 text-[16px] outline-none placeholder:text-faint"
          />
          <button
            type="submit"
            disabled={busy || !question.trim()}
            aria-label="질문하기"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-ink disabled:opacity-40"
          >
            {busy ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M5 12h14" />
                <path d="m13 6 6 6-6 6" />
              </svg>
            )}
          </button>
        </div>
      </form>

      {!result && !busy && !error && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-faint">이렇게 물어보세요</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => {
                  setQuestion(ex);
                  ask(ex);
                }}
                className="rounded-full border border-line bg-surface px-3.5 py-2 text-[13px] text-soft shadow-sm"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {busy && (
        <div className="rounded-2xl border border-line bg-surface px-4 py-5 text-sm text-soft shadow-sm">
          <p className="flex items-center gap-2.5">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            질문을 검색조건으로 바꾸고, 명함을 뒤져서 정리하는 중… (수십 초 걸릴 수 있어요)
          </p>
        </div>
      )}

      {error && (
        <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</p>
      )}

      {result && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-soft">
              <span className="font-semibold text-ink">{result.rows.length}건</span> 찾음
              <span className="text-faint"> · 후보 {result.candidateCount}장 검토</span>
            </p>
            {result.rows.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={copyTable}
                  className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium shadow-sm"
                >
                  {copied ? "복사됨 ✓" : "표 복사"}
                </button>
                <button
                  onClick={downloadCsv}
                  className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium shadow-sm"
                >
                  CSV
                </button>
              </div>
            )}
          </div>

          {result.rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line-strong bg-surface/50 px-5 py-8 text-center text-sm text-soft">
              {result.note ?? `"${asked}" 에 맞는 명함을 찾지 못했습니다.`}
            </div>
          ) : (
            <ul className="space-y-2.5">
              {result.rows.map((row, i) => (
                <li key={i} className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold">{row.company ?? "회사 미상"}</div>
                      <div className="mt-0.5 text-sm text-soft">
                        {[row.name, row.title].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                    {row.card_id && (
                      <Link
                        href={`/cards/${row.card_id}`}
                        className="shrink-0 text-xs font-medium text-brand"
                      >
                        명함 보기
                      </Link>
                    )}
                  </div>

                  <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {row.phone && (
                      <a href={`tel:${row.phone}`} className="font-medium text-brand">
                        {row.phone}
                      </a>
                    )}
                    {row.email && (
                      <a href={`mailto:${row.email}`} className="font-medium text-brand">
                        {row.email}
                      </a>
                    )}
                    {!row.phone && !row.email && (
                      <span className="text-faint">연락처 없음</span>
                    )}
                  </div>

                  {row.why && <p className="mt-2 text-xs text-faint">{row.why}</p>}
                </li>
              ))}
            </ul>
          )}

          {result.note && result.rows.length > 0 && (
            <p className="rounded-xl bg-brand-soft px-3.5 py-2.5 text-[13px] text-brand">
              {result.note}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
