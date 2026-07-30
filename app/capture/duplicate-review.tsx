"use client";

import Link from "next/link";
import { Action } from "@/components/ui";

export interface DuplicateCandidate {
  id: string;
  company: string | null;
  name: string | null;
  title: string | null;
  department: string | null;
  mobile: string | null;
  email: string | null;
  is_current: boolean;
  created_at: string;
}

export interface DuplicateReport {
  samePerson: DuplicateCandidate[];
  sameCompany: DuplicateCandidate[];
}

/**
 * 저장 직전 중복 확인. 세 가지 상황을 구분해서 보여준다.
 *
 *  1) 같은 사람으로 보이는 명함이 있음 → "새 명함으로 교체" 또는 "따로 저장"
 *  2) 같은 회사의 다른 사람만 있음     → 정보만 제공하고 그대로 저장
 *  3) 아무것도 없음                    → 이 컴포넌트를 띄우지 않는다
 */
export function DuplicateReview({
  report,
  onReplace,
  onSaveNew,
  onCancel,
  busy,
}: {
  report: DuplicateReport;
  /** 지정한 명함을 대체하며 저장 */
  onReplace: (supersedesId: string) => void;
  /** 별개 명함으로 저장 */
  onSaveNew: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const { samePerson, sameCompany } = report;

  return (
    <div className="space-y-4 rounded-2xl border border-warn/30 bg-warn-soft p-4">
      <div>
        <h2 className="font-semibold text-warn">
          {samePerson.length > 0 ? "이미 등록된 명함이 있습니다" : "같은 회사 명함이 있습니다"}
        </h2>
        <p className="mt-1 text-[13px] text-warn/80">
          {samePerson.length > 0
            ? "같은 분으로 보입니다. 새 명함으로 교체할지, 별개로 남길지 골라주세요."
            : "같은 회사의 다른 분들입니다. 이대로 저장하면 됩니다."}
        </p>
      </div>

      {samePerson.length > 0 && (
        <ul className="space-y-2">
          {samePerson.map((c) => (
            <li key={c.id} className="rounded-xl border border-line bg-surface p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{c.company ?? "회사 미상"}</div>
                  <div className="mt-0.5 truncate text-sm text-soft">
                    {[c.name, c.title, c.department].filter(Boolean).join(" · ") || "이름 미상"}
                  </div>
                  <div className="mt-1 truncate text-xs text-faint">
                    {[c.mobile, c.email].filter(Boolean).join(" · ")}
                  </div>
                  <div className="mt-1 text-xs text-faint">
                    {new Date(c.created_at).toLocaleDateString("ko-KR")} 등록
                    {!c.is_current && " · 지난 명함"}
                  </div>
                </div>
                <Link
                  href={`/cards/${c.id}`}
                  target="_blank"
                  className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center px-2 text-xs font-medium text-brand"
                >
                  열기
                </Link>
              </div>

              <Action
                onClick={() => onReplace(c.id)}
                disabled={busy}
                className="mt-2.5 w-full"
              >
                이 명함을 새 명함으로 교체
              </Action>
            </li>
          ))}
        </ul>
      )}

      {sameCompany.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-warn/80">
            같은 회사에 등록된 다른 분 {sameCompany.length}명
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {sameCompany.slice(0, 6).map((c) => (
              <li key={c.id}>
                <Link
                  href={`/cards/${c.id}`}
                  target="_blank"
                  className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-3 py-2 text-xs"
                >
                  {[c.name, c.title].filter(Boolean).join(" ") || "이름 미상"}
                </Link>
              </li>
            ))}
            {sameCompany.length > 6 && (
              <li className="self-center text-xs text-faint">+{sameCompany.length - 6}</li>
            )}
          </ul>
        </div>
      )}

      <div className="flex gap-2">
        <Action
          onClick={onCancel}
          disabled={busy}
          variant="secondary"
        >
          돌아가기
        </Action>
        <Action
          onClick={onSaveNew}
          disabled={busy}
          variant={samePerson.length > 0 ? "secondary" : "primary"}
          className="flex-1"
        >
          {busy ? "저장 중…" : samePerson.length > 0 ? "그래도 새 명함으로 저장" : "저장"}
        </Action>
      </div>
    </div>
  );
}
