"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ClipboardCheck } from "lucide-react";
import { StateBlock } from "@/components/ui";
import { useDraftQueue } from "@/lib/use-draft-queue";
import type { DraftQueueActions, DraftQueueSnapshot } from "@/lib/draft-queue-state";
import type { DraftRow } from "@/lib/drafts";
import { EMPTY_DRAFT, type CardDraft } from "@/app/capture/card-form";
import { CardReview } from "@/components/card-review";

export type ReviewViewProps = Readonly<{
  snapshot: DraftQueueSnapshot;
  actions: DraftQueueActions;
  knownTags: readonly string[];
}>;

export function ReviewView({ snapshot, actions, knownTags }: ReviewViewProps) {
  const reviewable = [...snapshot.ready, ...snapshot.failed];
  const current = reviewable[0] ?? null;
  const waiting = snapshot.waiting.length + snapshot.processing.length;

  if (snapshot.loading) {
    return <StateBlock state="loading" title="대기열을 불러오는 중" description="보관된 원본과 분석 상태를 확인하고 있습니다." />;
  }

  if (current === null) {
    return (
      <StateBlock
        state={waiting > 0 ? "info" : "empty"}
        title={waiting > 0 ? "아직 읽는 중인 명함이 있습니다" : "검토할 명함이 없습니다"}
        description={waiting > 0 ? `${waiting}장은 원본을 보존한 채 처리 중입니다. 완료되면 이 화면에 나타납니다.` : "촬영 화면에서 명함을 추가하면 여기서 내용을 확인할 수 있습니다."}
        action={<Link href="/capture" className="ui-action ui-action-primary"><ArrowLeft aria-hidden="true" className="size-4" />촬영 화면으로</Link>}
      />
    );
  }

  return (
    <ReviewEditor
      key={current.id}
      row={current}
      knownTags={knownTags}
      readyCount={reviewable.length}
      waiting={waiting}
      actions={actions}
    />
  );
}

export function ReviewClient({ knownTags }: { knownTags: string[] }) {
  const queue = useDraftQueue();
  return <ReviewView snapshot={queue} actions={queue} knownTags={knownTags} />;
}

function ReviewEditor({ row, knownTags, readyCount, waiting, actions }: Readonly<{
  row: DraftRow;
  knownTags: readonly string[];
  readyCount: number;
  waiting: number;
  actions: DraftQueueActions;
}>) {
  const [draft, setDraft] = useState<CardDraft>(() => ({ ...EMPTY_DRAFT, ...(row.extracted ?? {}) }));

  return (
    <CardReview
      imagePath={row.image_path}
      imageUrl={row.image_url}
      draftId={row.id}
      draftStatus={row.status === "failed" ? "failed" : "extracted"}
      draftError={row.error}
      initialEnrich={row.enrich ? {
        industry: row.enrich.industry,
        capabilities: row.enrich.capabilities,
        summary: row.enrich.summary,
        confident: row.enrich.confident,
        sources: row.enrich.sources,
      } : null}
      draft={draft}
      onChange={setDraft}
      knownTags={[...knownTags]}
      onSaved={(cardId) => {
        if (isUuid(cardId)) return actions.acknowledgeFinalized(row.id, cardId);
        return Promise.resolve();
      }}
      onDiscard={() => void actions.discard(row.id)}
      onRetry={() => void actions.retry(row.id)}
      header={
        <div className="flex items-center justify-between gap-3 rounded-xl bg-brand-soft px-3.5 py-3 text-sm text-brand">
          <span className="flex min-w-0 items-center gap-2"><ClipboardCheck aria-hidden="true" className="size-4 shrink-0" /><span className="truncate">확인 대기 {readyCount}장{waiting > 0 ? ` · 처리 중 ${waiting}장` : ""}</span></span>
          <Link href="/capture" className="shrink-0 text-xs font-semibold underline underline-offset-2">사진 더 담기</Link>
        </div>
      }
    />
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
