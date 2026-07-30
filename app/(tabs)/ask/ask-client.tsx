"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Clipboard, Download, Mail, Phone, Sparkles } from "lucide-react";
import { Action, StateBlock, Surface } from "@/components/ui";

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

export type AskViewProps = Readonly<{
  initialResult?: AskResult | null;
  onAsk?: (question: string) => Promise<AskResult>;
}>;

export function AskClient(props: AskViewProps = {}) {
  return <AskView {...props} />;
}

export function AskView({ initialResult = null, onAsk }: AskViewProps = {}) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResult | null>(initialResult);
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
      if (onAsk) {
        setResult(await onAsk(trimmed));
      } else {
        const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: trimmed }) });
        const json: unknown = await res.json();
        if (!res.ok || typeof json !== "object" || json === null) {
          const message = typeof json === "object" && json !== null && "error" in json && typeof json.error === "string" ? json.error : "질의에 실패했습니다.";
          setError(message);
          return;
        }
        setResult(json as AskResult);
      }
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
    <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start lg:gap-6">
      <Surface variant="tinted" className="p-4 sm:p-5 lg:sticky lg:top-6 lg:col-start-1 lg:row-start-1">
        <div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-ink"><Sparkles aria-hidden="true" className="size-5" /></span><div><h2 className="font-semibold">명함에게 물어보기</h2><p className="mt-1 text-sm text-soft">질문은 등록된 명함 안에서만 찾아 안전하게 정리합니다.</p></div></div>
      </Surface>
      <form
        className="lg:col-start-2 lg:row-start-1"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-3 shadow-sm focus-within:border-brand focus-within:ring-3 focus-within:ring-brand-soft">
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
            placeholder="예: 담당자 연락처를 정리해줘"
            className="max-h-40 w-full resize-none bg-transparent px-1 py-1 text-[16px] outline-none placeholder:text-faint focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
          />
          <Action
            type="submit"
            disabled={busy || !question.trim()}
            aria-label="질문하기"
            className="ui-icon-button shrink-0"
            icon={busy ? undefined : <ArrowRight aria-hidden="true" className="size-5" />}
            loading={busy}
          >
          </Action>
        </div>
      </form>

      {!result && !busy && !error && (
        <div className="space-y-2 lg:col-start-1">
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
                className="min-h-11 rounded-full border border-line bg-surface px-3.5 py-2 text-[13px] text-soft shadow-sm hover:bg-surface-hover"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {busy && (
        <div className="lg:col-start-2">
          <StateBlock state="loading" title="명함을 검색하는 중" description="질문을 검색 조건으로 바꾸고 결과를 정리하고 있습니다." />
        </div>
      )}

      {error && (
        <div className="lg:col-start-2">
          <StateBlock state="error" title="질의를 완료하지 못했습니다" description={error} action={<Action variant="secondary" onClick={() => asked && ask(asked)}>다시 시도</Action>} />
        </div>
      )}

      {result && (
        <section className="space-y-3 lg:col-start-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-soft">
              <span className="font-semibold text-ink">{result.rows.length}건</span> 찾음
              <span className="text-faint"> · 후보 {result.candidateCount}장 검토</span>
            </p>
            {result.rows.length > 0 && (
              <div className="flex gap-2">
                <Action
                  onClick={copyTable}
                  variant="secondary"
                  className="px-3 py-2 text-xs"
                  icon={<Clipboard aria-hidden="true" className="size-4" />}
                >
                  {copied ? "복사됨" : "표 복사"}
                </Action>
                <Action
                  onClick={downloadCsv}
                  variant="secondary"
                  className="px-3 py-2 text-xs"
                  icon={<Download aria-hidden="true" className="size-4" />}
                >
                  CSV
                </Action>
              </div>
            )}
          </div>

          {result.rows.length === 0 ? (
            <StateBlock state="empty" title="맞는 명함을 찾지 못했습니다" description={result.note ?? (asked ? `“${asked}”에 맞는 명함이 없습니다.` : "질문을 조금 바꿔 다시 시도해 보세요.")} />
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
                    {safePhone(row.phone) && (
                      <a href={`tel:${row.phone}`} className="inline-flex min-h-11 items-center gap-1.5 break-all font-medium text-brand">
                        <Phone aria-hidden="true" className="size-4 shrink-0" />
                        {row.phone}
                      </a>
                    )}
                    {safeEmail(row.email) && (
                      <a href={`mailto:${row.email}`} className="inline-flex min-h-11 items-center gap-1.5 break-all font-medium text-brand">
                        <Mail aria-hidden="true" className="size-4 shrink-0" />
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

function safePhone(value: string | null): string | null { return typeof value === "string" && /^[+()\d][\d ()-]{5,24}$/.test(value.trim()) ? value.trim() : null; }
function safeEmail(value: string | null): string | null { return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? value.trim() : null; }
