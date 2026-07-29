"use client";

import { useRef } from "react";
import Link from "next/link";
import { useDraftQueue } from "@/lib/use-draft-queue";

/**
 * 명함 담기 — 촬영·분석·검토를 분리한 대기열 화면.
 *
 * 예전에는 한 장 찍을 때마다 AI 분석 10~30초를 화면 앞에서 기다려야 했다.
 * 지금은 사진만 담고 곧바로 다음 장을 찍을 수 있고, 분석은 뒤에서 한 장씩
 * 돌아간다. 검토는 다 담은 뒤 /capture/review 에서 몰아서 한다.
 */
export function CaptureClient({ connected }: { connected: boolean }) {
  const albumRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const queue = useDraftQueue();

  const { drafts, analyzingId, enrichingCompany, uploading, loading, stopped, error } = queue;
  const ready = drafts.filter((d) => d.status === "extracted");
  const pending = drafts.filter((d) => d.status === "pending");
  const failed = drafts.filter((d) => d.status === "failed");

  function pick(input: HTMLInputElement | null) {
    input?.click();
  }

  if (!connected) {
    return (
      <div className="space-y-4 rounded-2xl border border-warn/25 bg-warn-soft p-5">
        <p className="text-sm text-warn">
          명함을 분석하려면 AI 계정(ChatGPT 또는 Claude)을 먼저 연결해야 합니다.
        </p>
        <Link
          href="/settings"
          className="inline-block rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-ink"
        >
          설정으로 이동
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-32">
      {error && (
        <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</p>
      )}

      {stopped && (
        <div className="space-y-2.5 rounded-xl bg-warn-soft px-3.5 py-3">
          <p className="text-sm text-warn">{stopped}</p>
          <button
            type="button"
            onClick={queue.retryFailed}
            className="rounded-lg bg-warn/15 px-3 py-1.5 text-xs font-semibold text-warn"
          >
            다시 시도
          </button>
        </div>
      )}

      {drafts.length === 0 && !uploading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            onClick={() => pick(cameraRef.current)}
            className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-brand/40 bg-brand-soft/30 px-6 py-10 text-center transition active:scale-[0.98]"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-brand-ink">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
                <path d="M4 8h2.5L8 5.8h8L17.5 8H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
            </span>
            <span className="font-semibold text-foreground">명함 촬영하기</span>
            <span className="text-[13px] text-soft">찍고 바로 다음 장</span>
          </button>

          <button
            onClick={() => pick(albumRef.current)}
            className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-line-strong bg-surface/60 px-6 py-10 text-center transition active:scale-[0.98]"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-hover text-foreground">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </svg>
            </span>
            <span className="font-semibold text-foreground">앨범에서 선택하기</span>
            <span className="text-[13px] text-soft">여러 장 한 번에</span>
          </button>
        </div>
      )}

      {loading && drafts.length === 0 && (
        <p className="text-sm text-soft">대기열을 불러오는 중…</p>
      )}

      {(drafts.length > 0 || uploading > 0) && (
        <section className="space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-semibold">{drafts.length}장 담김</span>
            {uploading > 0 && <span className="text-soft">· 올리는 중 {uploading}</span>}
            {ready.length > 0 && <span className="text-ok">· 분석 완료 {ready.length}</span>}
            {pending.length > 0 && <span className="text-soft">· 대기 {pending.length}</span>}
            {failed.length > 0 && <span className="text-danger">· 실패 {failed.length}</span>}
          </div>

          {pending.length > 0 && !stopped && (
            <p className="flex items-center gap-2 text-xs text-soft">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent" />
              뒤에서 한 장씩 읽는 중입니다. 계속 찍으셔도 됩니다.
            </p>
          )}

          {/* 명함을 다 읽은 뒤 회사 정보를 회사 단위로 한 번씩 찾아둔다.
              검토 화면에서 20~40초를 기다리지 않게 하려는 것이다. */}
          {enrichingCompany && !stopped && (
            <p className="flex items-center gap-2 text-xs text-soft">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent" />
              {enrichingCompany} — 웹에서 회사 정보를 찾는 중
            </p>
          )}

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {drafts.map((d) => (
              <div key={d.id} className="relative overflow-hidden rounded-xl border border-line bg-paper">
                {d.image_url ? (
                  // Storage 서명 URL — next/image 최적화 대상이 아니다.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.image_url} alt="" className="h-24 w-full object-cover" />
                ) : (
                  <div className="h-24 w-full" />
                )}

                <span
                  className={`absolute left-1 top-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                    d.status === "extracted"
                      ? "bg-ok-soft text-ok"
                      : d.status === "failed"
                        ? "bg-danger-soft text-danger"
                        : "bg-surface/90 text-soft"
                  }`}
                >
                  {d.status === "extracted"
                    ? "완료"
                    : d.status === "failed"
                      ? "실패"
                      : d.id === analyzingId
                        ? "읽는 중"
                        : "대기"}
                </span>

                <button
                  type="button"
                  onClick={() => queue.discard(d.id)}
                  aria-label="이 사진 버리기"
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-md bg-surface/90 text-xs text-soft"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {failed.length > 0 && !stopped && (
            <button
              type="button"
              onClick={queue.retryFailed}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-soft"
            >
              실패한 {failed.length}장 다시 시도
            </button>
          )}
        </section>
      )}

      {/* 앨범 선택용 — multiple 로 여러 장을 한 번에 담는다.
          (capture 속성을 빼야 iOS 사진 보관함이 열린다) */}
      <input
        ref={albumRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void queue.add(files);
        }}
      />

      {/* 카메라 직접 촬영용 — 한 번에 한 장이지만 기다림이 없어 연달아 찍을 수 있다 */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void queue.add(files);
        }}
      />

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/95 p-4 backdrop-blur pb-safe">
        <div className="mx-auto flex max-w-2xl flex-col gap-2 pb-3">
          <div className="flex gap-2">
            <button
              onClick={() => pick(cameraRef.current)}
              className="flex-1 rounded-xl bg-brand px-3 py-3.5 text-sm font-semibold text-brand-ink"
            >
              📷 카메라 촬영
            </button>
            <button
              onClick={() => pick(albumRef.current)}
              className="flex-1 rounded-xl border border-line bg-surface px-3 py-3.5 text-sm font-semibold text-foreground"
            >
              🖼️ 앨범에서 선택
            </button>
          </div>

          {ready.length > 0 && (
            <Link
              href="/capture/review"
              className="rounded-xl bg-ok px-4 py-3.5 text-center text-sm font-semibold text-brand-ink"
            >
              검토 시작 ({ready.length}장)
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
