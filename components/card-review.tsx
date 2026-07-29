"use client";

import { useState } from "react";
import { CardForm, type CardDraft } from "@/app/capture/card-form";
import { DuplicateReview, type DuplicateReport } from "@/app/capture/duplicate-review";
import { EnrichPanel, type EnrichSuggestion } from "@/components/enrich-panel";
import { CompanyTagsPanel } from "@/components/company-tags-panel";

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
  onChange,
  knownTags,
  onSaved,
  onDiscard,
  discardLabel = "버리기",
  header,
  initialEnrich = null,
}: {
  imagePath: string;
  /** 미리보기 (Storage 서명 URL 또는 로컬 blob) */
  imageUrl: string | null;
  draft: CardDraft;
  onChange: (draft: CardDraft) => void;
  knownTags: string[];
  /** 저장 성공 — 대기열에서 이 건을 치우고 다음으로 넘어간다 */
  onSaved: () => void;
  onDiscard: () => void;
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

    onSaved();
  }

  return (
    <div className="space-y-5 pb-32">
      {header}

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

      {imageUrl && (
        // Storage 서명 URL / 로컬 blob 둘 다 next/image 최적화 대상이 아니다.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt="명함"
          className="w-full rounded-2xl border border-line bg-surface object-contain shadow-sm"
        />
      )}

      <CardForm draft={draft} onChange={onChange} knownTags={knownTags} />

      {/* 이미 등록한 동료가 있으면 웹 검색보다 이쪽이 빠르고 일관된다 */}
      <CompanyTagsPanel
        company={draft.company}
        currentCapabilities={draft.capabilities}
        onApply={(capabilities) => onChange({ ...draft, capabilities: [...new Set(capabilities)] })}
      />

      {/* 저장 전에 역량 태그를 채워두면 나중에 질의로 찾을 수 있다. */}
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

      {/* 한 손 조작을 위해 주요 버튼을 화면 하단에 고정.
          중복 확인 중에는 그 카드 안의 버튼으로 결정하므로 숨긴다. */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/95 p-4 backdrop-blur pb-safe ${
          phase === "duplicate" ? "hidden" : ""
        }`}
      >
        <div className="mx-auto flex max-w-2xl gap-2 pb-3">
          <button
            type="button"
            onClick={onDiscard}
            disabled={phase !== "review"}
            className="rounded-xl border border-line bg-surface px-4 py-3.5 text-sm font-medium disabled:opacity-60"
          >
            {discardLabel}
          </button>
          <button
            type="button"
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
        </div>
      </div>
    </div>
  );
}
