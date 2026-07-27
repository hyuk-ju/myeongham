"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CardForm, EMPTY_DRAFT, type CardDraft } from "@/app/capture/card-form";
import { EnrichPanel } from "./enrich-panel";

interface CardRow extends CardDraft {
  id: string;
  created_at: string;
  is_current: boolean;
  supersedes_id: string | null;
}

interface Colleague {
  id: string;
  name: string | null;
  title: string | null;
  department: string | null;
}

interface RelatedCard {
  id: string;
  name: string | null;
  title: string | null;
  created_at?: string;
}

/** DB 행 → 폼 드래프트 (여분 컬럼 제거 + null 정규화) */
function toDraft(card: CardRow): CardDraft {
  const draft: Record<string, unknown> = { ...EMPTY_DRAFT };
  for (const key of Object.keys(EMPTY_DRAFT) as (keyof CardDraft)[]) {
    const v = card[key];
    draft[key] = v ?? EMPTY_DRAFT[key];
  }
  // date 컬럼은 "2026-07-27" 형태 그대로 온다 — input[type=date] 와 호환.
  return draft as unknown as CardDraft;
}

export function CardDetail({
  card,
  imageUrl,
  knownTags,
  colleagues,
  previousCard,
  replacedBy,
}: {
  card: CardRow;
  imageUrl: string | null;
  knownTags: string[];
  colleagues: Colleague[];
  previousCard: RelatedCard | null;
  replacedBy: RelatedCard | null;
}) {
  const router = useRouter();
  const initial = useMemo(() => toDraft(card), [card]);
  const [draft, setDraft] = useState<CardDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  // 웹 검색으로 담은 태그가 있으면 저장 시 근거를 'web' 으로 남긴다.
  const [usedWebSearch, setUsedWebSearch] = useState(false);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(initial),
    [draft, initial],
  );

  // 해외 명함은 휴대폰이 두 개일 수 있다 — 있는 것 중 먼저 잡히는 번호로 건다.
  const primaryPhone = card.mobile ?? card.mobile2 ?? card.phone;

  async function save() {
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/cards/${card.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...draft,
        ...(usedWebSearch ? { capabilities_source: "web" } : {}),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setMessage({ kind: "error", text: json.error ?? "저장에 실패했습니다." });
      return;
    }
    setMessage({ kind: "ok", text: "저장했습니다." });
    router.refresh();
  }

  async function remove() {
    if (!confirm("이 명함을 삭제할까요? 이미지도 함께 삭제됩니다.")) return;
    setDeleting(true);
    const res = await fetch(`/api/cards/${card.id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setMessage({ kind: "error", text: json.error ?? "삭제에 실패했습니다." });
      setDeleting(false);
      return;
    }
    router.replace("/cards");
    router.refresh();
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-24">
      <header className="mb-4 flex items-center justify-between">
        <Link href="/cards" className="flex items-center gap-1 text-sm font-medium text-soft">
          ← 명함 목록
        </Link>
        <button
          onClick={remove}
          disabled={deleting}
          className="text-sm font-medium text-danger disabled:opacity-50"
        >
          {deleting ? "삭제 중…" : "삭제"}
        </button>
      </header>

      <div className="mb-2">
        <h1 className="text-xl font-bold tracking-tight">
          {card.company ?? "회사 미상"}
        </h1>
        <p className="mt-0.5 text-sm text-soft">
          {[card.name, card.title].filter(Boolean).join(" · ") || "이름 미상"} ·{" "}
          {new Date(card.created_at).toLocaleDateString("ko-KR")} 등록
        </p>
      </div>

      {/* 명함 이력 — 같은 사람의 새/옛 명함이 있으면 서로 오갈 수 있게 한다 */}
      {replacedBy && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-warn-soft px-3.5 py-2.5 text-sm text-warn">
          <span>지난 명함입니다. 더 최근 명함이 있습니다.</span>
          <Link href={`/cards/${replacedBy.id}`} className="shrink-0 font-semibold">
            최신 명함 →
          </Link>
        </div>
      )}
      {previousCard && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm shadow-sm">
          <span className="text-soft">
            이전 명함{previousCard.title ? ` (${previousCard.title})` : ""}이 있습니다
          </span>
          <Link href={`/cards/${previousCard.id}`} className="shrink-0 font-medium text-brand">
            보기
          </Link>
        </div>
      )}

      {/* 빠른 연락 버튼 — 전화·문자·메일을 한 번에 */}
      <div className="mb-5 flex gap-2">
        {primaryPhone && (
          <a
            href={`tel:${primaryPhone}`}
            className="flex-1 rounded-xl bg-brand px-3 py-2.5 text-center text-sm font-medium text-brand-ink"
          >
            전화
          </a>
        )}
        {(card.mobile ?? card.mobile2) && (
          <a
            href={`sms:${card.mobile ?? card.mobile2}`}
            className="flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-center text-sm font-medium shadow-sm"
          >
            문자
          </a>
        )}
        {card.email && (
          <a
            href={`mailto:${card.email}`}
            className="flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-center text-sm font-medium shadow-sm"
          >
            메일
          </a>
        )}
      </div>

      {imageUrl ? (
        // signed URL 은 만료가 있어 next/image 캐시 대상이 아니다 — img 를 쓴다.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt="명함 원본"
          className="mb-6 w-full rounded-2xl border border-line bg-surface object-contain shadow-sm"
        />
      ) : (
        <p className="mb-6 rounded-xl bg-warn-soft px-3.5 py-2.5 text-sm text-warn">
          이미지를 불러오지 못했습니다.
        </p>
      )}

      <CardForm draft={draft} onChange={setDraft} knownTags={knownTags} expanded />

      <EnrichPanel
        cardId={card.id}
        company={draft.company}
        currentIndustry={draft.industry}
        currentCapabilities={draft.capabilities}
        onApply={(patch) => {
          if (patch.capabilities !== undefined) setUsedWebSearch(true);
          setDraft((d) => ({
            ...d,
            ...(patch.industry !== undefined ? { industry: patch.industry } : {}),
            ...(patch.capabilities !== undefined
              ? { capabilities: [...new Set(patch.capabilities)] }
              : {}),
          }));
        }}
      />

      {colleagues.length > 0 && (
        <section className="mt-6 space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[13px] font-semibold text-soft">
              같은 회사 {colleagues.length}명
            </h2>
            {card.company && (
              <Link
                href={`/cards?company=${encodeURIComponent(card.company)}`}
                className="text-[13px] text-brand"
              >
                모아 보기
              </Link>
            )}
          </div>
          <ul className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
            {colleagues.slice(0, 8).map((c) => (
              <li key={c.id} className="border-b border-line last:border-b-0">
                <Link href={`/cards/${c.id}`} className="block px-4 py-3 active:bg-paper">
                  <div className="truncate text-sm font-medium">{c.name ?? "이름 미상"}</div>
                  <div className="truncate text-xs text-soft">
                    {[c.title, c.department].filter(Boolean).join(" · ") || "직함 미상"}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {message && (
        <p
          className={`mt-4 rounded-xl px-3.5 py-2.5 text-sm ${
            message.kind === "ok" ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"
          }`}
        >
          {message.text}
        </p>
      )}

      {/* 저장 바 — 변경이 있을 때만 하단에 뜬다 */}
      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/95 p-4 backdrop-blur pb-safe">
          <div className="mx-auto flex max-w-2xl gap-2 pb-3">
            <button
              onClick={() => setDraft(initial)}
              className="rounded-xl border border-line bg-surface px-4 py-3 text-sm font-medium"
            >
              되돌리기
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex-1 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-ink disabled:opacity-60"
            >
              {saving ? "저장 중…" : "변경사항 저장"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
