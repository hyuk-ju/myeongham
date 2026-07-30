"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Action } from "@/components/ui";

type CopyStatus = "idle" | "copied" | "failed";

type CopySupportDetailsProps = Readonly<{
  supportCode: string;
  maskedEmail: string | null;
}>;

export function CopySupportDetails({
  supportCode,
  maskedEmail,
}: CopySupportDetailsProps) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const payload = [
    maskedEmail ? `마스킹 이메일: ${maskedEmail}` : null,
    `지원 코드: ${supportCode}`,
  ]
    .filter((value): value is string => value !== null)
    .join("\n");

  function copyDetails(): void {
    const clipboard = navigator.clipboard;
    if (clipboard === undefined) {
      setStatus("failed");
      return;
    }

    void clipboard.writeText(payload).then(
      () => {
        setStatus("copied");
        window.setTimeout(() => setStatus("idle"), 2_000);
      },
      () => setStatus("failed"),
    );
  }

  return (
    <div className="ui-surface ui-surface-slip space-y-4 p-4">
      <dl className="space-y-3 text-sm">
        {maskedEmail ? (
          <div>
            <dt className="text-xs font-semibold text-soft">마스킹 이메일</dt>
            <dd className="mt-1 break-all font-mono text-xs">{maskedEmail}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs font-semibold text-soft">지원 코드</dt>
          <dd className="mt-1 break-all font-mono text-sm font-semibold tracking-wide">
            {supportCode}
          </dd>
        </div>
      </dl>

      <Action
        onClick={copyDetails}
        icon={
          status === "copied" ? (
            <Check aria-hidden="true" className="size-4" />
          ) : (
            <Copy aria-hidden="true" className="size-4" />
          )
        }
        className="w-full"
      >
        {status === "copied" ? "복사됨" : "지원 정보 복사"}
      </Action>

      <p aria-live="polite" className="min-h-5 text-xs text-soft">
        {status === "failed"
          ? "클립보드에 복사하지 못했습니다. 화면의 지원 코드를 직접 선택해 주세요."
          : status === "copied"
            ? "마스킹된 지원 정보만 복사했습니다."
            : "원본 계정 식별자는 표시하거나 복사하지 않습니다."}
      </p>
    </div>
  );
}
