"use client";

import { useState } from "react";
import { CardForm, type CardDraft } from "@/app/capture/card-form";
import { DuplicateReview, type DuplicateReport } from "@/app/capture/duplicate-review";
import { EnrichPanel, type EnrichSuggestion } from "@/components/enrich-panel";
import { CompanyTagsPanel } from "@/components/company-tags-panel";
import { Action } from "@/components/ui";
import { Check, CircleAlert, LoaderCircle, Save, Trash2 } from "lucide-react";

type Phase = "review" | "checking" | "duplicate" | "saving";

/**
 * 명함 한 장을 확인·수정하고 저장하는 화면.
 *
 * 예전에는 capture-client 안에 붙어 있었는데, 대기열에서 한 장씩 검토하는
 * 화면도 같은 UI 가 필요해서 따로 뺐다. 중복 확인 → 저장 흐름도 여기 있다.
 */
export function CardReview({
  imagePath,
  imageUrl,
  draft,
  draftId,
  draftStatus = "extracted",
  draftError = null,
  onChange,
  knownTags,
  onSaved,
  onDiscard,
  discardLabel = "버리기",
  header,
  initialEnrich = null,
  onRetry,
}: {
  imagePath: string;
  /** 미리보기 (Storage 서명 URL 또는 로컬 blob) */
  imageUrl: string | null;
  draft: CardDraft;
  draftId?: string;
  draftStatus?: "extracted" | "failed" | "processing";
  draftError?: string | null;
  onChange: (draft: CardDraft) => void;
  knownTags: string[];
  /** 저장 성공 — 대기열에서 이 건을 치우고 다음으로 넘어간다 */
  onSaved: (cardId: string) => void | Promise<void>;
  onDiscard: () => void;
  onRetry?: () => void;
  discardLabel?: string;
  header?: React.ReactNode;
  /** 대기열에서 미리 받아둔 회사 정보 제안 */
  initialEnrich?: EnrichSuggestion | null;
}) {
  const [phase, setPhase] = useState<Phase>("review");
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateReport | null>(null);
  // 웹 검색으로 담은 태그가 있으면 저장 시 근거를 'web' 으로 남긴다.
  const [usedWebSearch, setUsedWebSearch] = useState(false);

  /** 저장 버튼 → 먼저 중복 후보를 조회하고, 있으면 사용자에게 판단을 넘긴다. */
  async function requestSave() {
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
    if (draftStatus === "processing") {
      setError("아직 읽는 중인 명함은 저장할 수 없습니다.");
      setPhase(duplicates === null ? "review" : "duplicate");
      return;
    }
    setPhase("saving");
    setError(null);
    try {
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          ...(draftId === undefined ? { image_path: imagePath } : { draft_id: draftId }),
          supersedes_id: supersedesId ?? null,
          ...(usedWebSearch ? { capabilities_source: "web" } : {}),
        }),
      });
      const payload: unknown = await res.json();
      if (!res.ok) {
        setError(readError(payload));
        setPhase(duplicates === null ? "review" : "duplicate");
        return;
      }
      const cardId = readCardId(payload);
      if (cardId === null) {
        setError("저장 응답을 확인하지 못했습니다.");
        setPhase(duplicates === null ? "review" : "duplicate");
        return;
      }
      await onSaved(cardId);
    } catch (error) {
      if (error instanceof TypeError || error instanceof SyntaxError) {
        setError("네트워크가 불안정해 저장 여부를 확인하지 못했습니다. 다시 시도하세요.");
        setPhase(duplicates === null ? "review" : "duplicate");
        return;
      }
      throw error;
    }
  }

  const busy = phase !== "review";

  return (
    <div className="space-y-5 pb-6 [overflow-wrap:anywhere]" aria-busy={busy}>
      {header}

      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</p>
      )}

      {draftStatus === "failed" && (
        <div role="alert" className="space-y-2 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
          <p className="flex items-start gap-2 font-semibold"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{draftError ?? "AI 읽기에 실패했습니다."}</p>
          <p>내용을 직접 입력해 저장하거나 AI 읽기를 다시 시도할 수 있습니다.</p>
          {onRetry && (
            <Action variant="secondary" onClick={onRetry} icon={<LoaderCircle aria-hidden="true" className="size-4" />}>AI 다시 시도</Action>
          )}
        </div>
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

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-8">
        <div className="space-y-4 lg:sticky lg:top-6">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="명함" className="aspect-[4/3] w-full rounded-2xl border border-line bg-surface object-contain shadow-slip" />
          ) : <div className="flex aspect-[4/3] items-center justify-center rounded-2xl border border-line bg-surface text-soft"><span>원본 이미지를 불러오지 못했습니다.</span></div>}
          <div className="rounded-xl border border-line bg-surface p-3 text-sm text-soft">
            <p className="flex items-center gap-2 font-medium text-ink"><Check aria-hidden="true" className="size-4 text-ok" />원본 이미지는 저장 전까지 보존됩니다.</p>
            <p className="mt-1">OCR 값은 직접 수정할 수 있으며, 저장에 성공해야 다음 카드로 이동합니다.</p>
          </div>
        </div>
        <div className="min-w-0 space-y-5">
          <CardForm draft={draft} onChange={onChange} knownTags={knownTags} />
          <CompanyTagsPanel
            company={draft.company}
            currentCapabilities={draft.capabilities}
            onApply={(capabilities) => onChange({ ...draft, capabilities: [...new Set(capabilities)] })}
          />
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
            initial={initialEnrich}
            onApply={(patch) => {
              if (patch.fromWeb) setUsedWebSearch(true);
              onChange({
                ...draft,
                ...(patch.industry !== undefined ? { industry: patch.industry } : {}),
                ...(patch.capabilities !== undefined
                  ? { capabilities: [...new Set(patch.capabilities)] }
                  : {}),
              });
            }}
          />
        </div>
      </div>

      {/* 한 손 조작을 위해 주요 버튼을 화면 하단에 고정.
          중복 확인 중에는 그 카드 안의 버튼으로 결정하므로 숨긴다. */}
      <footer className={`mt-6 border-t border-line bg-surface/95 px-4 pt-3 pb-safe sm:px-6 ${phase === "duplicate" ? "hidden" : ""}`}>
        <div className="mx-auto flex max-w-2xl gap-2 pb-3">
          <Action variant="secondary" onClick={onDiscard} disabled={busy} icon={<Trash2 aria-hidden="true" className="size-4" />}>{discardLabel}</Action>
          <Action className="flex-1" onClick={requestSave} disabled={busy} loading={phase === "checking" || phase === "saving"} icon={phase === "review" ? <Save aria-hidden="true" className="size-4" /> : undefined}>
            {phase === "checking" ? "중복 확인 중" : phase === "saving" ? "저장 중" : "저장하고 다음 장"}
          </Action>
        </div>
      </footer>
    </div>
  );
}

function readCardId(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const id = Object.fromEntries(Object.entries(value)).id;
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : null;
}

function readError(value: unknown): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "저장에 실패했습니다.";
  const error = Object.fromEntries(Object.entries(value)).error;
  return typeof error === "string" && error.trim() ? error : "저장에 실패했습니다.";
}
