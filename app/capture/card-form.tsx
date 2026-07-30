"use client";

import { useState } from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";
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

type FieldConfig = Readonly<{ key: keyof CardDraft; label: string; type?: string; required?: boolean }>;

const FIELDS: readonly FieldConfig[] = [
  { key: "company", label: "회사", required: true },
  { key: "name", label: "이름", required: true },
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

const REQUIRED_FIELDS = FIELDS.filter((field) => field.required);

interface Props {
  draft: CardDraft;
  onChange: (draft: CardDraft) => void;
  knownTags: string[];
  expanded?: boolean;
  compactLayout?: boolean;
}

export function CardForm({ draft, onChange, knownTags, expanded = false, compactLayout = false }: Props) {
  const [tagInput, setTagInput] = useState("");
  const [showAll, setShowAll] = useState(expanded);

  function set<K extends keyof CardDraft>(key: K, value: CardDraft[K]) {
    onChange({ ...draft, [key]: value });
  }

  function addTag(tag: string) {
    const value = tag.trim();
    if (!value || draft.capabilities.includes(value)) return;
    set("capabilities", [...draft.capabilities, value]);
    setTagInput("");
  }

  const visible = showAll ? FIELDS : FIELDS.filter((field, index) => index < 8 || Boolean(draft[field.key]));
  const requiredMissing = REQUIRED_FIELDS.filter((field) => !String(draft[field.key] ?? "").trim());
  const suggestions = knownTags.filter((tag) => !draft.capabilities.includes(tag)).slice(0, 8);
  const lowConfidence = draft.confidence > 0 && draft.confidence < 0.7;
  const fieldGridClass = compactLayout ? "mt-4 grid gap-4 lg:grid-cols-2" : "mt-4 grid gap-4 sm:grid-cols-2";

  return (
    <div className={compactLayout ? "space-y-5 [overflow-wrap:break-word] [word-break:keep-all]" : "space-y-5 [overflow-wrap:anywhere]"}>
      <section aria-labelledby="required-fields-title" className="rounded-2xl border border-line bg-surface p-3 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-soft">VERIFY FIRST</p>
            <h2 id="required-fields-title" className="mt-1 text-lg font-semibold tracking-tight">필수 확인</h2>
            <p className="mt-1 text-sm text-soft">회사와 이름은 저장 전에 확인해 주세요.</p>
          </div>
          {requiredMissing.length > 0 ? <span className="rounded-lg bg-warn-soft px-2.5 py-1.5 text-xs font-semibold text-warn">미입력 {requiredMissing.length}개</span> : <span className="inline-flex items-center gap-1 rounded-lg bg-ok-soft px-2.5 py-1.5 text-xs font-semibold text-ok"><Check aria-hidden="true" className="size-3.5" />확인됨</span>}
        </div>
        {lowConfidence ? <p role="status" className="mt-3 rounded-xl bg-warn-soft px-3.5 py-2.5 text-sm text-warn">전체 OCR 확신도가 {Math.round(draft.confidence * 100)}%입니다. 낮은 확신 필드를 한 번 더 확인하세요.</p> : null}
        <div className={fieldGridClass}>
          {REQUIRED_FIELDS.map((field) => <FieldInput key={field.key} field={field} draft={draft} onChange={set} lowConfidence={lowConfidence} compactLayout={compactLayout} />)}
        </div>
      </section>

      <section aria-labelledby="additional-fields-title" className="rounded-2xl border border-line bg-surface p-3 shadow-sm sm:p-5">
        <div className={compactLayout ? "flex flex-col items-start gap-2" : "flex items-start justify-between gap-3"}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-soft">CARD DETAILS</p>
            <h2 id="additional-fields-title" className="mt-1 text-lg font-semibold tracking-tight">추가 정보</h2>
          </div>
          <span className="rounded-lg bg-surface-hover px-2.5 py-1.5 text-xs font-medium text-soft">OCR · 직접 수정 가능</span>
        </div>
        <div className={fieldGridClass}>
          {visible.filter((field) => !field.required).map((field) => <FieldInput key={field.key} field={field} draft={draft} onChange={set} lowConfidence={lowConfidence} compactLayout={compactLayout} />)}
        </div>
        {!showAll ? <button type="button" onClick={() => setShowAll(true)} className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2">나머지 항목 보기 <ChevronDown aria-hidden="true" className="size-4" /></button> : null}
      </section>

      <section aria-labelledby="capabilities-title" className="rounded-2xl border border-line bg-surface p-3 shadow-sm sm:p-5">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="capabilities-title" className="text-base font-semibold">역량 태그</h2>
            <p className="mt-1 text-sm text-soft">검색에 사용할 회사의 제품·서비스를 추가하세요.</p>
          </div>
          {draft.capabilities.length > 0 ? <button type="button" onClick={() => set("capabilities", [])} className="min-h-11 whitespace-nowrap px-2 text-xs font-semibold text-soft underline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2">전부 지우기</button> : null}
        </div>
        {draft.capabilities.length > 0 ? <div className="mt-3 flex flex-wrap gap-2">{draft.capabilities.map((tag) => <button key={tag} type="button" onClick={() => set("capabilities", draft.capabilities.filter((item) => item !== tag))} className="inline-flex min-h-11 max-w-full min-w-0 items-center gap-1 whitespace-normal [overflow-wrap:anywhere] [word-break:break-word] rounded-full bg-brand px-3 py-1.5 text-xs font-medium text-brand-ink focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2">{tag}<X aria-hidden="true" className="size-3.5 shrink-0" /></button>)}</div> : null}
        <div className="mt-3 flex gap-2">
          <input aria-label="역량 태그 입력" value={tagInput} onChange={(event) => setTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); addTag(tagInput); } }} onBlur={() => { if (tagInput.trim()) addTag(tagInput); }} placeholder="예: 정밀가공 · Enter로 추가" className="ui-field-control min-w-0 flex-1" />
          <button type="button" onClick={() => addTag(tagInput)} aria-label="역량 태그 추가" className="ui-action ui-action-secondary size-11 shrink-0 p-0"><Plus aria-hidden="true" className="size-4" /></button>
        </div>
        {suggestions.length > 0 ? <div className="mt-3 flex flex-wrap gap-2">{suggestions.map((tag) => <button key={tag} type="button" onClick={() => addTag(tag)} className="inline-flex min-h-11 max-w-full min-w-0 items-center gap-1 whitespace-normal [overflow-wrap:anywhere] [word-break:break-word] rounded-full border border-line px-3 py-1.5 text-xs font-medium text-soft hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"><Plus aria-hidden="true" className="size-3.5 shrink-0" />{tag}</button>)}</div> : null}
      </section>

      <label className="grid gap-2 rounded-2xl border border-line bg-surface p-3 shadow-sm sm:p-5" htmlFor="card-notes">
        <span className="text-base font-semibold">메모</span>
        <span className="text-sm text-soft">명함에 없는 맥락이나 후속 메모를 남겨두세요.</span>
        <textarea id="card-notes" value={draft.notes ?? ""} onChange={(event) => set("notes", event.target.value || null)} rows={3} placeholder="예: 견적 빠름, 소량 제작 가능" className="ui-field-control resize-y" />
        <span className="text-xs text-soft">직접 입력</span>
      </label>
    </div>
  );
}

function FieldInput({ field, draft, onChange, lowConfidence, compactLayout }: Readonly<{ field: FieldConfig; draft: CardDraft; onChange: <K extends keyof CardDraft>(key: K, value: CardDraft[K]) => void; lowConfidence: boolean; compactLayout: boolean }>) {
  const value = draft[field.key];
  const textValue = typeof value === "string" ? value : "";
  const missing = field.required && textValue.trim().length === 0;
  const normalized = field.type === "tel" && textValue.includes("-");
  const sourceLabel = missing ? "비어 있음" : normalized ? "정규화" : lowConfidence ? "OCR · 낮은 확신" : "OCR";
  const sourceClass = missing || lowConfidence ? "bg-warn-soft text-warn" : normalized ? "bg-brand-soft text-brand" : "bg-surface-hover text-soft";
  const fieldId = `card-${String(field.key)}`;

  return (
    <label className="grid min-w-0 gap-2" htmlFor={fieldId}>
      <span className={`${compactLayout ? "flex flex-col items-start gap-1 text-xs" : "flex flex-wrap items-center justify-between gap-2 text-sm"} font-semibold text-ink`}><span>{field.label}{field.required ? <span className="ml-1 text-danger" aria-hidden="true">*</span> : null}</span><span className={`rounded-md px-2 py-1 text-[11px] font-medium ${sourceClass}`}>{sourceLabel}</span></span>
      <input id={fieldId} type={field.type ?? "text"} inputMode={field.type === "tel" ? "tel" : undefined} required={field.required} aria-required={field.required || undefined} aria-invalid={missing || undefined} value={textValue} onChange={(event) => onChange(field.key, (event.target.value || null) as CardDraft[typeof field.key])} onBlur={field.type === "tel" ? (event) => { const normalizedValue = normalizePhoneOrNull(event.target.value); if (normalizedValue !== (draft[field.key] as string | null)) onChange(field.key, normalizedValue as CardDraft[typeof field.key]); } : undefined} className={`${compactLayout ? "text-xs tracking-tight sm:text-sm" : ""} ui-field-control min-w-0`} />
      {missing ? <span className="text-xs font-medium text-danger">저장 전에 입력해 주세요.</span> : null}
    </label>
  );
}
