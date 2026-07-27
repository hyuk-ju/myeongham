"use client";

import { useState } from "react";

/** 사용자 식별자를 보여주고 한 번에 복사하게 한다 (폰에서 타이핑하기 어려우므로). */
export function CopyId({ userId, email }: { userId: string; email: string | null }) {
  const [copied, setCopied] = useState(false);

  const payload = [email ? `이메일: ${email}` : null, `사용자 ID: ${userId}`]
    .filter(Boolean)
    .join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드가 막힌 브라우저 — 화면의 값을 직접 선택해 복사하면 된다.
    }
  }

  return (
    <div className="space-y-2 rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <dl className="space-y-2 text-sm">
        {email && (
          <div>
            <dt className="text-xs font-semibold text-soft">이메일</dt>
            <dd className="mt-0.5 break-all font-mono text-xs select-all">{email}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs font-semibold text-soft">사용자 ID</dt>
          <dd className="mt-0.5 break-all font-mono text-xs select-all">{userId}</dd>
        </div>
      </dl>

      <button
        onClick={copy}
        className="w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink"
      >
        {copied ? "복사됨 ✓" : "복사하기"}
      </button>
    </div>
  );
}
