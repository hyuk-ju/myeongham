"use client";

import { useEffect, useState } from "react";
import { Check, Plus } from "lucide-react";
import type { CompanyCapabilities, CompanyTag } from "@/app/api/cards/company-capabilities/route";
import { Action, Chip } from "@/components/ui";

/**
 * 같은 회사의 다른 명함이 이미 가진 역량 태그를 재사용한다.
 *
 * 웹 검색(EnrichPanel)보다 위에 둔다. 회사에 한 번 붙인 태그가 있으면 20~40초
 * 걸리는 검색을 다시 돌릴 이유가 없고, 같은 회사 태그가 카드마다 달라지면
 * 질문할 때 한 사람만 걸리고 동료가 빠지기 때문이다.
 *
 * 태그가 없으면 아무것도 렌더링하지 않는다 — 첫 명함일 때 빈 상자를 보여줘봐야
 * 화면만 길어진다.
 */
export function CompanyTagsPanel({
  company,
  excludeCardId,
  currentCapabilities,
  onApply,
}: {
  company: string | null;
  /** 상세 화면에서 보고 있는 카드 자신은 빼야 한다 */
  excludeCardId?: string;
  currentCapabilities: string[];
  onApply: (capabilities: string[]) => void;
}) {
  /** 어느 회사의 결과인지 함께 들고 있는다 — 회사명이 바뀌면 렌더 단계에서 버린다 */
  const [result, setResult] = useState<{
    company: string;
    tags: CompanyTag[];
    totalCards: number;
  } | null>(null);

  const name = company?.trim() ?? "";

  useEffect(() => {
    if (!name) return;

    // 촬영 화면에서는 회사명을 타이핑할 수 있다. 글자마다 조회하지 않도록 늦춘다.
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ company: name });
        if (excludeCardId) params.set("exclude", excludeCardId);
        const res = await fetch(`/api/cards/company-capabilities?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const json = (await res.json()) as CompanyCapabilities;
        setResult({
          company: name,
          tags: json.tags ?? [],
          totalCards: json.total_cards ?? 0,
        });
      } catch {
        // 조회 실패는 조용히 넘긴다 — 없어도 되는 보조 기능이다.
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [name, excludeCardId]);

  // 회사명을 고치는 중이면 이전 회사 결과가 남아 있다. 지우지 말고 무시한다.
  const fresh = result && result.company === name ? result : null;
  if (!fresh?.tags.length) return null;

  const { tags, totalCards } = fresh;
  const missing = tags.filter((t) => !currentCapabilities.includes(t.tag));

  function toggle(tag: string) {
    onApply(
      currentCapabilities.includes(tag)
        ? currentCapabilities.filter((t) => t !== tag)
        : [...currentCapabilities, tag],
    );
  }

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">같은 회사 명함에서 가져오기</h2>
          <p className="mt-0.5 text-xs text-soft">
            {name} 명함 {totalCards}장에 이미 붙어 있는 태그입니다.
          </p>
        </div>
        {missing.length > 0 && (
          <Action
            onClick={() => onApply([...new Set([...currentCapabilities, ...tags.map((t) => t.tag)])])}
            className="shrink-0"
          >
            {missing.length}개 담기
          </Action>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tags.map(({ tag, card_count }) => {
          const on = currentCapabilities.includes(tag);
          return (
            <Chip
              key={tag}
              onClick={() => toggle(tag)}
              selected={on}
            >
              {on ? <Check aria-hidden="true" className="mr-1 size-3.5" /> : <Plus aria-hidden="true" className="mr-1 size-3.5" />}{tag}
              {card_count > 1 ? <span className="ml-1 font-normal opacity-60">{card_count}</span> : null}
            </Chip>
          );
        })}
      </div>

      {missing.length === 0 && (
        <p className="rounded-lg bg-ok-soft px-3 py-2 text-xs font-medium text-ok">
          같은 회사 태그를 모두 담았습니다. 웹 검색은 하지 않아도 됩니다.
        </p>
      )}
    </section>
  );
}
