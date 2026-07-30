"use client";

import { useRef } from "react";
import Link from "next/link";
import {
  Check,
  CircleAlert,
  FileImage,
  LoaderCircle,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { Action, IconButton, Progress, StateBlock } from "@/components/ui";
import { useDraftQueue } from "@/lib/use-draft-queue";
import type { DraftQueueActions, DraftQueueSnapshot } from "@/lib/draft-queue-state";
import type { DraftRow } from "@/lib/drafts";

export type CaptureViewProps = Readonly<{
  connected: boolean;
  snapshot: DraftQueueSnapshot;
  actions: DraftQueueActions;
}>;

export function CaptureView({ connected, snapshot, actions }: CaptureViewProps) {
  const albumRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const total = snapshot.drafts.length + snapshot.uploads.length;
  const complete = snapshot.ready.length;
  const active = snapshot.processing.length + snapshot.waiting.length + snapshot.uploading;
  const failed = snapshot.failed.length + snapshot.uploads.filter((item) => item.status === "failed").length;
  const progressLabel = total === 0
    ? "아직 담긴 명함 없음"
    : `${complete}장 완료 · ${active}장 처리 중 · ${failed}장 확인 필요`;

  function pick(input: HTMLInputElement | null) {
    input?.click();
  }

  if (!connected) {
    return (
      <StateBlock
        state="info"
        title="AI 연결이 필요합니다"
        description="명함을 분석하려면 설정에서 ChatGPT 또는 Claude를 먼저 연결하세요."
        action={<Link href="/settings" className="ui-action ui-action-primary">설정으로 이동</Link>}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 pb-36 [overflow-wrap:anywhere]">
      {snapshot.errorCode ? (
        <div role="alert" className="flex items-start gap-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">대기열 작업을 완료하지 못했습니다.</p>
            <p className="mt-1 text-danger/80">{queueCodeMessage(snapshot.errorCode)}</p>
          </div>
        </div>
      ) : null}

      {snapshot.stopCode ? (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
          <div>
            <p className="font-semibold">자동 처리를 잠시 멈췄습니다.</p>
            <p className="mt-1 text-warn/80">{queueCodeMessage(snapshot.stopCode)}</p>
          </div>
          <Action variant="secondary" icon={<RotateCcw aria-hidden="true" className="size-4" />} onClick={actions.retryFailed}>다시 시도</Action>
        </div>
      ) : null}

      {snapshot.loading ? (
        <div role="status" aria-live="polite" className="space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <div className="h-5 w-40 animate-pulse rounded bg-surface-hover" />
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {["one", "two", "three"].map((key) => <div key={key} className="aspect-[4/3] animate-pulse rounded-xl bg-surface-hover" />)}
          </div>
          <span className="sr-only">대기열을 불러오는 중</span>
        </div>
      ) : total === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <CaptureSourceCard icon={<FileImage aria-hidden="true" className="size-7" />} title="명함 촬영" description="한 장씩 찍어도 바로 다음 장을 담을 수 있어요." onClick={() => pick(cameraRef.current)} primary />
          <CaptureSourceCard icon={<Upload aria-hidden="true" className="size-7" />} title="앨범에서 선택" description="여러 장을 한 번에 선택해 대기열에 담아요." onClick={() => pick(albumRef.current)} />
        </div>
      ) : (
        <section aria-labelledby="capture-tray-title" className="space-y-4 rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-faint">BATCH TRAY</p>
              <h2 id="capture-tray-title" className="mt-1 text-lg font-semibold tracking-tight">{total}장 담김</h2>
              <p role="status" aria-live="polite" className="mt-1 text-sm text-soft">{progressLabel}</p>
            </div>
            <Action variant="secondary" icon={<Plus aria-hidden="true" className="size-4" />} onClick={() => pick(albumRef.current)}>사진 추가</Action>
          </div>
          <Progress label="대기열 진행률" value={complete + (failed > 0 ? failed : 0)} max={Math.max(total, 1)} />

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
            {snapshot.uploads.length > 0 || snapshot.drafts.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3">
                {snapshot.uploads.map((upload) => <UploadTile key={upload.localId} upload={upload} actions={actions} />)}
                {snapshot.drafts.map((draft) => <DraftTile key={draft.id} draft={draft} analyzingId={snapshot.analyzingId} actions={actions} />)}
              </div>
            ) : null}

            <aside className="space-y-3 lg:sticky lg:top-6">
              {snapshot.enrichingCompany ? (
                <p role="status" aria-live="polite" className="flex items-center gap-2 rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand">
                  <LoaderCircle aria-hidden="true" className="ui-spinner size-4" /> {snapshot.enrichingCompany} 회사 정보를 확인하는 중
                </p>
              ) : null}

              <div className="rounded-xl border border-line bg-paper p-3 text-sm text-soft">
                <p className="font-medium text-ink">검토할 준비가 된 명함은 {complete}장입니다.</p>
                <p className="mt-1">완료된 카드만 검토 화면으로 이동하며, 처리 중인 카드는 원본과 함께 계속 보존됩니다.</p>
              </div>
            </aside>
          </div>
        </section>
      )}

      <input ref={albumRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*" className="hidden" onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void actions.add(files); }} />
      <input ref={cameraRef} type="file" accept="image/jpeg,image/png,image/webp,image/*" capture="environment" className="hidden" onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void actions.add(files); }} />

      <div className="sticky bottom-0 z-20 mx-0 border-t border-line bg-surface/95 px-4 pt-3 backdrop-blur pb-safe sm:px-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-2 pb-3">
          <div className="flex gap-2">
            <Action className="flex-1" icon={<FileImage aria-hidden="true" className="size-4" />} onClick={() => pick(cameraRef.current)}>촬영</Action>
            <Action variant="secondary" className="flex-1" icon={<Upload aria-hidden="true" className="size-4" />} onClick={() => pick(albumRef.current)}>앨범</Action>
          </div>
          {snapshot.ready.length > 0 ? <Link href="/capture/review" className="ui-action ui-action-secondary w-full justify-center border-ok bg-ok-soft text-ok">검토 시작 <span className="tabular-nums">{snapshot.ready.length}장</span></Link> : null}
        </div>
      </div>
    </div>
  );
}

export function CaptureClient({ connected }: { connected: boolean }) {
  const queue = useDraftQueue();
  return <CaptureView connected={connected} snapshot={queue} actions={queue} />;
}

function CaptureSourceCard({ icon, title, description, onClick, primary = false }: Readonly<{ icon: React.ReactNode; title: string; description: string; onClick: () => void; primary?: boolean }>) {
  return (
    <button type="button" onClick={onClick} className={`group flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 ${primary ? "border-brand/45 bg-brand-soft/40" : "border-line-strong bg-surface"}`}>
      <span className={`flex size-14 items-center justify-center rounded-2xl ${primary ? "bg-brand text-brand-ink" : "bg-surface-hover text-ink"}`}>{icon}</span>
      <span className="font-semibold text-ink">{title}</span>
      <span className="max-w-xs text-sm text-soft [word-break:keep-all]">{description}</span>
    </button>
  );
}

function UploadTile({ upload, actions }: Readonly<{ upload: DraftQueueSnapshot["uploads"][number]; actions: DraftQueueActions }>) {
  const failed = upload.status === "failed";
  return (
    <article className="relative overflow-hidden rounded-xl border border-line bg-paper" aria-label={failed ? "업로드 실패" : "업로드 중"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={upload.previewUrl} alt="업로드할 명함 미리보기" className="aspect-[4/3] w-full object-cover" />
      <div className="flex items-center justify-between gap-1 border-t border-line px-2 py-2">
        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${failed ? "text-danger" : "text-soft"}`}>
          {failed ? <CircleAlert aria-hidden="true" className="size-3.5" /> : <LoaderCircle aria-hidden="true" className="ui-spinner size-3.5" />}
          {failed ? "실패" : "올리는 중"}
        </span>
        <div className="flex gap-1">
          {failed ? <IconButton aria-label="업로드 다시 시도" onClick={() => void actions.retryUpload(upload.localId)} icon={<RotateCcw aria-hidden="true" className="size-4" />} /> : null}
          <IconButton aria-label="업로드 버리기" variant="danger" onClick={() => actions.discardUpload(upload.localId)} icon={<Trash2 aria-hidden="true" className="size-4" />} />
        </div>
      </div>
    </article>
  );
}

function DraftTile({ draft, analyzingId, actions }: Readonly<{ draft: DraftRow; analyzingId: string | null; actions: DraftQueueActions }>) {
  const state = draft.status === "extracted" ? "완료" : draft.status === "failed" ? "실패" : draft.id === analyzingId || draft.status === "processing" ? "읽는 중" : "대기";
  return (
    <article className="relative overflow-hidden rounded-xl border border-line bg-paper" aria-label={`${state} 명함`}>
      {draft.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={draft.image_url} alt="보관된 명함 미리보기" className="aspect-[4/3] w-full object-cover" />
      ) : <div className="flex aspect-[4/3] items-center justify-center bg-surface-hover"><FileImage aria-hidden="true" className="size-7 text-faint" /></div>}
      <div className="flex items-center justify-between gap-1 border-t border-line px-2 py-2">
        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${draft.status === "extracted" ? "text-ok" : draft.status === "failed" ? "text-danger" : "text-soft"}`}>
          {draft.status === "extracted" ? <Check aria-hidden="true" className="size-3.5" /> : draft.status === "failed" ? <CircleAlert aria-hidden="true" className="size-3.5" /> : <LoaderCircle aria-hidden="true" className="ui-spinner size-3.5" />}
          {state}
        </span>
        <div className="flex gap-1">
          {draft.status === "failed" ? <IconButton aria-label="명함 다시 읽기" onClick={() => void actions.retry(draft.id)} icon={<RotateCcw aria-hidden="true" className="size-4" />} /> : null}
          <IconButton aria-label="명함 버리기" variant="danger" onClick={() => void actions.discard(draft.id)} icon={<Trash2 aria-hidden="true" className="size-4" />} />
        </div>
      </div>
    </article>
  );
}

function queueCodeMessage(code: string): string {
  const messages: Readonly<Record<string, string>> = {
    network_error: "네트워크를 확인하고 실패한 항목을 다시 시도하세요.",
    provider_unconfigured: "연결된 AI 제공자가 없어 처리를 멈췄습니다.",
    rate_limited: "AI 제공자의 요청 한도에 도달했습니다. 잠시 후 다시 시도하세요.",
    unsupported_media: "지원하지 않는 이미지 형식입니다.",
  };
  return messages[code] ?? `상태 코드: ${code}`;
}
