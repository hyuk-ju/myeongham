"use client";

import { useEffect } from "react";
import { isClerkNotLinkedError } from "@/lib/supabase/errors";

/**
 * 촬영 화면 에러 경계.
 *
 * Supabase↔Clerk 연결 전에는 모든 조회가 실패하는데, 원인 메시지가
 * "No suitable key" 라 원인을 알기 어렵다. 그 경우만 따로 알아보고
 * 무엇을 하면 되는지 알려준다.
 */
export default function CaptureError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const notLinked = isClerkNotLinkedError(error);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-10">
      {notLinked ? (
        <div className="space-y-4 rounded-2xl border border-warn/30 bg-warn-soft p-5">
          <div>
            <h1 className="font-semibold text-warn">Supabase 연결이 한 단계 남았습니다</h1>
            <p className="mt-1 text-sm text-warn/80">
              로그인은 됐지만, Supabase 가 아직 Clerk 로그인을 신뢰하지 않아서
              명함을 읽지 못합니다. 아래 한 번만 설정하면 됩니다.
            </p>
          </div>

          <ol className="list-decimal space-y-2 pl-5 text-sm text-warn/90">
            <li>
              <a
                href="https://supabase.com/dashboard/project/qmsepwxdnekowqsiebnu/auth/third-party"
                target="_blank"
                rel="noreferrer"
                className="font-semibold underline"
              >
                Supabase → Authentication → Third-Party Auth
              </a>{" "}
              열기
            </li>
            <li>
              <strong>Add integration → Clerk</strong> 선택
            </li>
            <li>
              도메인에 아래 값을 붙여넣고 저장
              <code className="mt-1 block rounded-lg bg-surface px-3 py-2 font-mono text-xs text-ink">
                https://cosmic-caribou-59.clerk.accounts.dev
              </code>
            </li>
          </ol>

          <button
            onClick={reset}
            className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-ink"
          >
            설정했습니다 · 다시 시도
          </button>
        </div>
      ) : (
        <div className="space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <div>
            <h1 className="font-semibold">문제가 발생했습니다</h1>
            <p className="mt-1 text-sm text-soft">{error.message}</p>
          </div>
          <button
            onClick={reset}
            className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-ink"
          >
            다시 시도
          </button>
        </div>
      )}
    </main>
  );
}
