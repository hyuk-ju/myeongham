"use client";

import { useState } from "react";
import { normalizePhoneOrNull } from "@/lib/phone";

export interface CardDraft {
  name: string | null;
  name_en: string | null;
  title: string | null;
  department: string | null;
  company: string | null;
  company_en: string | null;
  phone: string | null;
  mobile: string | null;
  mobile2: string | null;
  fax: string | null;
  email: string | null;
  email2: string | null;
  website: string | null;
  address: string | null;
  postal_code: string | null;
  tax_code: string | null;
  raw_text: string | null;
  industry: string | null;
  capabilities: string[];
  confidence: number;
  notes: string | null;
  met_at: string | null;
  met_context: string | null;
}

export const EMPTY_DRAFT: CardDraft = {
  name: null, name_en: null, title: null, department: null,
  company: null, company_en: null, phone: null, mobile: null, mobile2: null,
  fax: null, email: null, email2: null, website: null, address: null, postal_code: null,
  tax_code: null, raw_text: null, industry: null, capabilities: [], confidence: 0,
  notes: null, met_at: null, met_context: null,
};

/** 화면에 노출할 필드와 라벨. 자주 쓰는 순서대로 — 8번째까지 기본 노출. */
const FIELDS: { key: keyof CardDraft; label: string; type?: string }[] = [
  { key: "company", label: "회사" },
  { key: "name", label: "이름" },
  { key: "title", label: "직함" },
  { key: "department", label: "부서" },
  { key: "mobile", label: "휴대폰", type: "tel" },
  { key: "mobile2", label: "휴대폰 2 (해외/추가 번호)", type: "tel" },
  { key: "phone", label: "사무실", type: "tel" },
  { key: "email", label: "이메일", type: "email" },
  { key: "email2", label: "이메일 2 (세금계산서 등)", type: "email" },
  { key: "fax", label: "팩스", type: "tel" },
  { key: "website", label: "웹사이트" },
  { key: "address", label: "주소" },
  { key: "industry", label: "업종" },
  { key: "company_en", label: "회사 (영문)" },
  { key: "name_en", label: "이름 (영문)" },
  { key: "tax_code", label: "사업자번호 / Taxcode" },
  { key: "met_at", label: "만난 날짜", type: "date" },
  { key: "met_context", label: "만난 자리 (전시회, 미팅 등)" },
];

interface Props {
  draft: CardDraft;
  onChange: (draft: CardDraft) => void;
  knownTags: string[];
  /** 상세 화면에서는 처음부터 모든 필드를 편다. */
  expanded?: boolean;
}

export function CardForm({ draft, onChange, knownTags, expanded = false }: Props) {
  const [tagInput, setTagInput] = useState("");
  const [showAll, setShowAll] = useState(expanded);

  function set<K extends keyof CardDraft>(key: K, value: CardDraft[K]) {
    onChange({ ...draft, [key]: value });
  }

  function addTag(tag: string) {
    const t = tag.trim();
    if (!t || draft.capabilities.includes(t)) return;
    set("capabilities", [...draft.capabilities, t]);
    setTagInput("");
  }

  // 기본 8개 + 값이 채워진 나머지 필드(해외 명함의 영문명·Taxcode 등)는 항상 보여준다.
  const visible = showAll
    ? FIELDS
    : FIELDS.filter((f, i) => i < 8 || !!draft[f.key]);
  const suggestions = knownTags.filter((t) => !draft.capabilities.includes(t)).slice(0, 8);

  const inputCls =
    "rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[16px] shadow-sm outline-none focus:border-brand";

  return (
    <div className="space-y-5">
      {draft.confidence > 0 && draft.confidence < 0.7 && (
        <p className="rounded-xl bg-warn-soft px-3.5 py-2.5 text-sm text-warn">
          신뢰도가 낮습니다 ({Math.round(draft.confidence * 100)}%). 값을 특히 꼼꼼히 확인하세요.
        </p>
      )}

      <div className="grid gap-3">
        {visible.map(({ key, label, type }) => (
          <label key={key} className="grid gap-1.5">
            <span className="text-xs font-semibold text-soft">{label}</span>
            <input
              type={type ?? "text"}
              inputMode={type === "tel" ? "tel" : undefined}
              value={(draft[key] as string) ?? ""}
              onChange={(e) => set(key, (e.target.value || null) as never)}
              onBlur={
                type === "tel"
                  ? (e) => {
                      // 사용자가 +82… 를 직접 입력해도 저장 전에 010-… 으로 맞춘다.
                      const normalized = normalizePhoneOrNull(e.target.value);
                      if (normalized !== (draft[key] as string | null)) {
                        set(key, normalized as never);
                      }
                    }
                  : undefined
              }
              className={inputCls}
            />
          </label>
        ))}
      </div>

      {!showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-sm font-medium text-brand"
        >
          나머지 항목 보기 ↓
        </button>
      )}

      {/* 역량 태그 — 이 앱의 검색 품질을 좌우하는 부분 */}
      <div className="space-y-2 rounded-2xl border border-line bg-surface p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold text-soft">
            역량 태그 <span className="font-normal text-faint">— 이 회사가 뭘 만드는지</span>
            {draft.capabilities.length > 0 && (
              <span className="font-normal text-faint"> ({draft.capabilities.length})</span>
            )}
          </span>
          {/* 웹 보강이 태그를 여러 개 담았을 때 하나씩 지우지 않아도 되게 한다 */}
          {draft.capabilities.length > 0 && (
            <button
              type="button"
              onClick={() => set("capabilities", [])}
              className="shrink-0 text-xs font-medium text-soft underline"
            >
              전부 지우기
            </button>
          )}
        </div>

        {draft.capabilities.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {draft.capabilities.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => set("capabilities", draft.capabilities.filter((t) => t !== tag))}
                className="rounded-full bg-brand px-3 py-1.5 text-xs font-medium text-brand-ink"
              >
                {tag} ✕
              </button>
            ))}
          </div>
        )}

        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag(tagInput);
            }
          }}
          onBlur={() => tagInput.trim() && addTag(tagInput)}
          placeholder="예: 정밀가공 · 입력 후 Enter"
          className="w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-[16px] outline-none focus:border-brand"
        />

        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => addTag(tag)}
                className="rounded-full border border-line px-3 py-1.5 text-xs text-soft"
              >
                + {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      <label className="grid gap-1.5">
        <span className="text-xs font-semibold text-soft">메모</span>
        <textarea
          value={draft.notes ?? ""}
          onChange={(e) => set("notes", e.target.value || null)}
          rows={2}
          placeholder="예: 견적 빠름, 소량 제작 가능"
          className="resize-none rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[16px] shadow-sm outline-none focus:border-brand"
        />
      </label>
    </div>
  );
}
