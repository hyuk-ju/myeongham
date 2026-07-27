import Link from "next/link";
import { requireUser } from "@/lib/auth";

const PAGE_SIZE = 30;

type Search = Promise<{
  q?: string;
  filter?: string;
  tag?: string;
  page?: string;
  company?: string;
}>;

export default async function CardsPage({ searchParams }: { searchParams: Search }) {
  const { supabase } = await requireUser();
  const params = await searchParams;

  const q = (params.q ?? "").trim();
  const filter = params.filter === "untagged" || params.filter === "archived"
    ? params.filter
    : "all";
  const tag = (params.tag ?? "").trim();
  const company = (params.company ?? "").trim();
  const page = Math.max(1, Number(params.page) || 1);

  let query = supabase
    .from("cards")
    .select(
      "id, name, company, title, department, mobile, mobile2, phone, email, capabilities, is_current, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  // 교체된 지난 명함은 기본으로 숨긴다 ("지난 명함" 필터로 볼 수 있다).
  query = filter === "archived" ? query.eq("is_current", false) : query.eq("is_current", true);
  if (company) query = query.ilike("company", company);

  if (q) {
    // PostgREST or() 구문과 충돌하는 문자는 공백으로 치환
    const term = q.replace(/[,()%.]/g, " ").trim();
    if (term) {
      query = query.or(
        ["company", "company_en", "name", "name_en", "title", "email", "industry", "raw_text", "notes"]
          .map((col) => `${col}.ilike.*${term}*`)
          .join(","),
      );
    }
  }
  if (filter === "untagged") query = query.eq("capabilities", "{}");
  if (tag) query = query.contains("capabilities", [tag]);

  const [{ data: cards, count }, tagsResult, companyRows] = await Promise.all([
    query,
    supabase.rpc("my_capability_tags"),
    // 회사별 인원수 — 같은 회사에 여러 명이면 목록에서 바로 알아보게 한다.
    supabase.from("cards").select("company").eq("is_current", true),
  ]);

  const companyCounts = new Map<string, number>();
  for (const row of companyRows.data ?? []) {
    const key = (row.company ?? "").trim().toLowerCase();
    if (key) companyCounts.set(key, (companyCounts.get(key) ?? 0) + 1);
  }

  const topTags = ((tagsResult.data ?? []) as { tag: string }[]).slice(0, 12);
  const total = count ?? 0;
  const hasMore = page * PAGE_SIZE < total;

  const buildUrl = (over: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = {
      q,
      filter: filter === "all" ? undefined : filter,
      tag,
      company,
      page: undefined,
      ...over,
    };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    const s = sp.toString();
    return s ? `/cards?${s}` : "/cards";
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-8">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-[22px] font-bold tracking-tight">명함</h1>
        <span className="text-sm text-soft">{total}장</span>
      </header>

      <form action="/cards" className="mb-3">
        {filter === "untagged" && <input type="hidden" name="filter" value="untagged" />}
        <div className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm">
          <SearchIcon className="h-4.5 w-4.5 shrink-0 text-faint" />
          <input
            name="q"
            defaultValue={q}
            placeholder="회사, 이름, 메모 검색"
            className="w-full bg-transparent text-[16px] outline-none placeholder:text-faint"
          />
          {q && (
            <Link href={buildUrl({ q: undefined })} className="shrink-0 text-sm text-faint">
              지우기
            </Link>
          )}
        </div>
      </form>

      {company && (
        <div className="mb-3 flex items-center justify-between rounded-xl bg-brand-soft px-3.5 py-2.5 text-sm text-brand">
          <span>
            <span className="font-semibold">{company}</span> 소속만 보는 중
          </span>
          <Link href={buildUrl({ company: undefined })} className="font-medium">
            해제
          </Link>
        </div>
      )}

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
        <Chip href={buildUrl({ filter: undefined, tag: undefined })} active={filter === "all" && !tag}>
          전체
        </Chip>
        <Chip href={buildUrl({ filter: "untagged", tag: undefined })} active={filter === "untagged"}>
          태그 없음
        </Chip>
        <Chip href={buildUrl({ filter: "archived", tag: undefined })} active={filter === "archived"}>
          지난 명함
        </Chip>
        {topTags.map(({ tag: t }) => (
          <Chip key={t} href={buildUrl({ tag: t === tag ? undefined : t, filter: undefined })} active={t === tag}>
            {t}
          </Chip>
        ))}
      </div>

      {!cards || cards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface/50 px-5 py-12 text-center">
          <p className="text-sm text-soft">
            {q || tag || filter === "untagged"
              ? "조건에 맞는 명함이 없습니다."
              : "아직 등록된 명함이 없습니다."}
          </p>
          {!q && !tag && filter === "all" && (
            <Link
              href="/capture"
              className="mt-3 inline-block rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-ink"
            >
              첫 명함 등록하기
            </Link>
          )}
        </div>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
          {cards.map((card) => {
            const key = (card.company ?? "").trim().toLowerCase();
            const colleagues = (companyCounts.get(key) ?? 0) - 1;
            return (
            <li key={card.id} className="border-b border-line last:border-b-0">
              <Link href={`/cards/${card.id}`} className="block px-4 py-3.5 active:bg-paper">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-semibold">
                    {card.company ?? "회사 미상"}
                    {colleagues > 0 && !company && (
                      <span className="ml-1.5 text-xs font-medium text-faint">
                        외 {colleagues}명
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-faint">{formatDate(card.created_at)}</span>
                </div>
                <div className="mt-0.5 truncate text-sm text-soft">
                  {[card.name, card.title, card.department].filter(Boolean).join(" · ") ||
                    "이름 미상"}
                </div>
                {card.capabilities.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {card.capabilities.slice(0, 4).map((t: string) => (
                      <span
                        key={t}
                        className="rounded-md bg-brand-soft px-1.5 py-0.5 text-[11px] font-medium text-brand"
                      >
                        {t}
                      </span>
                    ))}
                    {card.capabilities.length > 4 && (
                      <span className="text-[11px] text-faint">+{card.capabilities.length - 4}</span>
                    )}
                  </div>
                )}
              </Link>
            </li>
            );
          })}
        </ul>
      )}

      {hasMore && (
        <div className="mt-4 text-center">
          <Link
            href={buildUrl({ page: String(page + 1) })}
            className="inline-block rounded-xl border border-line bg-surface px-5 py-2.5 text-sm font-medium shadow-sm"
          >
            다음 페이지 ({page * PAGE_SIZE}/{total})
          </Link>
        </div>
      )}
    </main>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap ${
        active
          ? "bg-ink text-paper"
          : "border border-line bg-surface text-soft"
      }`}
    >
      {children}
    </Link>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}.${d.getDate()}`;
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
