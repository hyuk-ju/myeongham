"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { resizeForUpload } from "@/lib/image";
import { CardForm, EMPTY_DRAFT, type CardDraft } from "./card-form";
import { DuplicateReview, type DuplicateReport } from "./duplicate-review";
import { EnrichPanel } from "@/components/enrich-panel";
import { CompanyTagsPanel } from "@/components/company-tags-panel";

type Phase = "pick" | "analyzing" | "review" | "checking" | "duplicate" | "saving";

export function CaptureClient({
  connected,
  knownTags,
}: {
  connected: boolean;
  knownTags: string[];
}) {
  const albumRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("pick");
  const [preview, setPreview] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [draft, setDraft] = useState<CardDraft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateReport | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  // 웹 검색으로 담은 태그가 있으면 저장 시 근거를 'web' 으로 남긴다.
  const [usedWebSearch, setUsedWebSearch] = useState(false);

  async function handleFile(file: File) {
    setError(null);
    setDuplicates(null);
    setPreview(URL.createObjectURL(file));
    setPhase("analyzing");

    try {
      const resized = await resizeForUpload(file);
      const form = new FormData();
      form.append("image", resized);

      const res = await fetch("/api/extract", { method: "POST", body: form });
      const json = await res.json();

      if (json.imagePath) setImagePath(json.imagePath);

      if (!res.ok) {
        // 이미지는 저장됐으므로 수동 입력으로 넘어갈 수 있다.
        setError(`${json.error} — 아래에서 직접 입력할 수 있습니다.`);
        setDraft(EMPTY_DRAFT);
        setPhase("review");
        return;
      }

      setDraft({ ...EMPTY_DRAFT, ...json.card });
      setPhase("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드에 실패했습니다.");
      setPhase("pick");
    }
  }

  /** 저장 버튼 → 먼저 중복 후보를 조회하고, 있으면 사용자에게 판단을 넘긴다. */
  async function requestSave() {
    if (!imagePath) return;
    setPhase("checking");
    setError(null);

    try {
      const res = await fetch("/api/cards/duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (res.ok) {
        const report = (await res.json()) as DuplicateReport;
        if (report.samePerson.length || report.sameCompany.length) {
          setDuplicates(report);
          setPhase("duplicate");
          return;
        }
      }
      // 중복 조회가 실패해도 저장 자체를 막지는 않는다.
    } catch {
      // 네트워크 오류 — 그대로 저장으로 진행
    }
    await save();
  }

  async function save(supersedesId?: string) {
    if (!imagePath) return;
    setPhase("saving");
    setError(null);

    const res = await fetch("/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...draft,
        image_path: imagePath,
        supersedes_id: supersedesId ?? null,
        ...(usedWebSearch ? { capabilities_source: "web" } : {}),
      }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "저장에 실패했습니다.");
      setPhase("review");
      return;
    }

    setSavedCount((n) => n + 1);
    reset();
  }

  function reset() {
    setPhase("pick");
    setPreview(null);
    setImagePath(null);
    setDraft(EMPTY_DRAFT);
    setError(null);
    setDuplicates(null);
    setUsedWebSearch(false);
    if (albumRef.current) albumRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
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
      {savedCount > 0 && phase === "pick" && (
        <p className="rounded-xl bg-ok-soft px-3.5 py-2.5 text-sm text-ok">
          이번 세션에서 {savedCount}장 저장했습니다. 계속 찍으세요.
        </p>
      )}

      {error && (
        <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</p>
      )}

      {phase === "duplicate" && duplicates && (
        <DuplicateReview
          report={duplicates}
          busy={false}
          onReplace={(id) => save(id)}
          onSaveNew={() => save()}
          onCancel={() => {
            setDuplicates(null);
            setPhase("review");
          }}
        />
      )}

      {phase === "pick" && !preview && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            onClick={() => cameraRef.current?.click()}
            className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-brand/40 bg-brand-soft/30 px-6 py-10 text-center transition active:scale-[0.98]"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-brand-ink">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
                <path d="M4 8h2.5L8 5.8h8L17.5 8H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
            </span>
            <span className="font-semibold text-foreground">명함 촬영하기</span>
            <span className="text-[13px] text-soft">카메라로 바로 촬영</span>
          </button>

          <button
            onClick={() => albumRef.current?.click()}
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
            <span className="text-[13px] text-soft">저장된 명함 사진 선택</span>
          </button>
        </div>
      )}

      {preview && (
        // 로컬 blob 미리보기 — next/image 최적화 대상이 아니라 img 를 쓴다.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt="촬영한 명함"
          className="w-full rounded-2xl border border-line bg-surface object-contain shadow-sm"
        />
      )}

      {phase === "analyzing" && (
        <div className="rounded-2xl border border-line bg-surface px-4 py-4 shadow-sm">
          <p className="flex items-center gap-2.5 text-sm text-soft">
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            명함을 읽는 중… 10~30초 정도 걸립니다
          </p>
        </div>
      )}

      {(phase === "review" || phase === "checking" || phase === "saving") && (
        <>
          <CardForm draft={draft} onChange={setDraft} knownTags={knownTags} />

          {/* 이미 등록한 동료가 있으면 웹 검색보다 이쪽이 빠르고 일관된다 */}
          <CompanyTagsPanel
            company={draft.company}
            currentCapabilities={draft.capabilities}
            onApply={(capabilities) =>
              setDraft((d) => ({ ...d, capabilities: [...new Set(capabilities)] }))
            }
          />

          {/* 저장 전에 역량 태그를 채워두면 나중에 질의로 찾을 수 있다.
              나중에 상세 화면에서 다시 할 수도 있지만, 명함을 손에 든 지금
              하는 편이 훨씬 잘 잊지 않는다. */}
          <EnrichPanel
            subject={{
              company: draft.company,
              company_en: draft.company_en,
              website: draft.website,
              address: draft.address,
              tax_code: draft.tax_code,
            }}
            currentIndustry={draft.industry}
            currentCapabilities={draft.capabilities}
            onApply={(patch) => {
              if (patch.fromWeb) setUsedWebSearch(true);
              setDraft((d) => ({
                ...d,
                ...(patch.industry !== undefined ? { industry: patch.industry } : {}),
                ...(patch.capabilities !== undefined
                  ? { capabilities: [...new Set(patch.capabilities)] }
                  : {}),
              }));
            }}
          />
        </>
      )}

      {/* 앨범 선택용 (capture 속성 제거로 iOS 사진 보관함 지원) */}
      <input
        ref={albumRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      {/* 카메라 직접 촬영용 (capture="environment") */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      {/* 한 손 조작을 위해 주요 버튼을 화면 하단에 고정.
          중복 확인 중에는 그 카드 안의 버튼으로 결정하므로 숨긴다. */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/95 p-4 backdrop-blur pb-safe ${
          phase === "duplicate" ? "hidden" : ""
        }`}
      >
        <div className="mx-auto flex max-w-2xl gap-2 pb-3">
          {phase === "pick" && (
            <>
              <button
                onClick={() => cameraRef.current?.click()}
                className="flex-1 rounded-xl bg-brand px-3 py-3.5 text-sm font-semibold text-brand-ink"
              >
                📷 카메라 촬영
              </button>
              <button
                onClick={() => albumRef.current?.click()}
                className="flex-1 rounded-xl border border-line bg-surface px-3 py-3.5 text-sm font-semibold text-foreground"
              >
                🖼️ 앨범에서 선택
              </button>
            </>
          )}

          {phase === "analyzing" && (
            <button
              onClick={reset}
              className="flex-1 rounded-xl border border-line bg-surface px-4 py-3.5 text-sm font-medium"
            >
              취소
            </button>
          )}

          {(phase === "review" || phase === "checking" || phase === "saving") && (
            <>
              <button
                onClick={reset}
                className="rounded-xl border border-line bg-surface px-4 py-3.5 text-sm font-medium"
              >
                버리기
              </button>
              <button
                onClick={requestSave}
                disabled={phase !== "review"}
                className="flex-1 rounded-xl bg-brand px-4 py-3.5 text-sm font-semibold text-brand-ink disabled:opacity-60"
              >
                {phase === "checking"
                  ? "중복 확인 중…"
                  : phase === "saving"
                    ? "저장 중…"
                    : "저장하고 다음 장"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
