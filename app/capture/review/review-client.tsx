"use client";

import { useState } from "react";
import Link from "next/link";
import { useDraftQueue } from "@/lib/use-draft-queue";
import type { DraftRow } from "@/lib/drafts";
import { EMPTY_DRAFT, type CardDraft } from "@/app/capture/card-form";
import { CardReview } from "@/components/card-review";

/**
 * 대기열 검토 — 분석이 끝난 명함을 한 장씩 확인하고 저장한다.
 *
 * 저장하면 그 draft 를 치우고 자동으로 다음 장이 올라온다. 촬영 화면과 같은
 * 훅을 쓰므로, 여기 있는 동안에도 아직 안 읽은 사진이 뒤에서 계속 분석된다.
 */
export function ReviewClient({ knownTags }: { knownTags: string[] }) {
  const queue = useDraftQueue();
  const { drafts, loading } = queue;

  const ready = drafts.filter((d) => d.status === "extracted");
  const current = ready[0] ?? null;
  const waiting = drafts.filter((d) => d.status === "pending").length;

  if (loading) {
    return <p className="text-sm text-soft">대기열을 불러오는 중…</p>;
  }

  if (!current) {
    return (
      <div className="space-y-4 rounded-2xl border border-line bg-surface p-5 text-center shadow-sm">
        <p className="text-sm text-soft">
          {waiting > 0
            ? `아직 읽는 중인 사진이 ${waiting}장 있습니다. 잠시 후 다시 오세요.`
            : drafts.length > 0
              ? "검토할 수 있는 명함이 없습니다. 실패한 사진은 촬영 화면에서 다시 시도할 수 있습니다."
              : "검토할 명함이 없습니다."}
        </p>
        <Link
          href="/capture"
          className="inline-block rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-ink"
        >
          촬영 화면으로
        </Link>
      </div>
    );
  }

  return (
    // key 로 다음 장에서 폼 상태가 새로 시작된다 — effect 로 갈아끼울 필요가 없다.
    <ReviewOne
      key={current.id}
      row={current}
      knownTags={knownTags}
      readyCount={ready.length}
      waiting={waiting}
      onSaved={() => void queue.complete(current.id)}
      onDiscard={() => void queue.discard(current.id)}
    />
  );
}

function ReviewOne({
  row,
  knownTags,
  readyCount,
  waiting,
  onSaved,
  onDiscard,
}: {
  row: DraftRow;
  knownTags: string[];
  readyCount: number;
  waiting: number;
  onSaved: () => void;
  onDiscard: () => void;
}) {
  const [draft, setDraft] = useState<CardDraft>(() => ({
    ...EMPTY_DRAFT,
    ...(row.extracted ?? {}),
  }));

  return (
    <CardReview
      imagePath={row.image_path}
      imageUrl={row.image_url}
      initialEnrich={row.enrich}
      draft={draft}
      onChange={setDraft}
      knownTags={knownTags}
      // 저장 성공 — 이미지는 명함이 가져갔으므로 Storage 는 남긴다.
      onSaved={onSaved}
      onDiscard={onDiscard}
      header={
        <p className="rounded-xl bg-brand-soft px-3.5 py-2.5 text-sm text-brand">
          확인 대기 {readyCount}장{waiting > 0 && ` · 읽는 중 ${waiting}장`}
        </p>
      }
    />
  );
}
