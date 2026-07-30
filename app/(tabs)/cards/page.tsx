import Link from "next/link";
import { ArrowUpRight, Mail, Phone, Search, SlidersHorizontal } from "lucide-react";
import { StateBlock, StatusBadge, Surface } from "@/components/ui";

const PAGE_SIZE = 30;

export type CardsWorkspaceCard = Readonly<{
  id: string;
  name: string | null;
  company: string | null;
  title: string | null;
  department: string | null;
  mobile: string | null;
  mobile2: string | null;
  phone: string | null;
  email: string | null;
  capabilities: readonly string[];
  is_current: boolean;
  created_at: string;
}>;

export type CardsWorkspaceViewProps = Readonly<{
  cards: readonly CardsWorkspaceCard[];
  total: number;
  hasMore: boolean;
  page: number;
  q: string;
  filter: "all" | "untagged" | "archived";
  tag: string;
  company: string;
  topTags: readonly string[];
  companyCounts: Readonly<Record<string, number>>;
}>;

type Search = Promise<{ q?: string; filter?: string; tag?: string; page?: string; company?: string }>;

export default async function CardsPage({ searchParams }: { searchParams: Search }) {
  const { requireUser } = await import("@/lib/auth");
  const { supabase } = await requireUser();
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const filter = params.filter === "untagged" || params.filter === "archived" ? params.filter : "all";
  const tag = (params.tag ?? "").trim();
  const company = (params.company ?? "").trim();
  const page = Math.max(1, Number(params.page) || 1);

  let query = supabase
    .from("cards")
    .select("id, name, company, title, department, mobile, mobile2, phone, email, capabilities, is_current, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  query = filter === "archived" ? query.eq("is_current", false) : query.eq("is_current", true);
  if (company) query = query.ilike("company", company);
  if (q) {
    const term = q.replace(/[,()%.]/g, " ").trim();
    if (term) query = query.or(["company", "company_en", "name", "name_en", "title", "email", "industry", "raw_text", "notes"].map((column) => `${column}.ilike.*${term}*`).join(","));
  }
  if (filter === "untagged") query = query.eq("capabilities", "{}");
  if (tag) query = query.contains("capabilities", [tag]);

  const [{ data: rows, count }, tagsResult, companyRows] = await Promise.all([
    query,
    supabase.rpc("my_capability_tags"),
    supabase.from("cards").select("company").eq("is_current", true),
  ]);
  const companyCounts = new Map<string, number>();
  for (const row of companyRows.data ?? []) {
    const key = (row.company ?? "").trim().toLowerCase();
    if (key) companyCounts.set(key, (companyCounts.get(key) ?? 0) + 1);
  }
  const companyCountRecord = Object.fromEntries(companyCounts);
  const topTags = ((tagsResult.data ?? []) as ReadonlyArray<{ tag: string }>).slice(0, 12).map(({ tag: value }) => value);
  const total = count ?? 0;
  const cards = ((rows ?? []) as CardsWorkspaceCard[]).map((card) => ({ ...card, capabilities: card.capabilities ?? [] }));

  return <CardsWorkspaceView cards={cards} total={total} hasMore={page * PAGE_SIZE < total} page={page} q={q} filter={filter} tag={tag} company={company} topTags={topTags} companyCounts={companyCountRecord} />;
}

export function CardsWorkspaceView({ cards, total, hasMore, page, q, filter, tag, company, topTags, companyCounts }: CardsWorkspaceViewProps) {
  const buildUrl = (over: Record<string, string | undefined>) => {
    const merged = { q: q || undefined, filter: filter === "all" ? undefined : filter, tag: tag || undefined, company: company || undefined, page: undefined, ...over };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
    const query = params.toString();
    return query ? `/cards?${query}` : "/cards";
  };
  const selected = cards[0] ?? null;
  const isFiltered = Boolean(q || tag || company || filter !== "all");

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-10 pt-8 sm:px-6 lg:px-8 lg:pt-12">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-semibold text-brand">Card index</p><h1 className="mt-1 text-[clamp(1.75rem,4vw,2.5rem)] font-bold tracking-tight">명함</h1><p className="mt-1 text-sm text-soft">필터와 검색으로 빠르게 찾고, 선택한 명함을 바로 확인하세요.</p></div>
        <span className="rounded-full bg-brand-soft px-3 py-1.5 text-sm font-semibold text-brand">{total}장</span>
      </header>

      <div className="mb-6 flex items-center gap-2 rounded-2xl border border-line bg-surface p-3 shadow-sm">
        <Search aria-hidden="true" className="size-5 shrink-0 text-faint" />
        <form action="/cards" className="flex min-w-0 flex-1 items-center gap-2"><label htmlFor="cards-search" className="sr-only">명함 검색</label><input id="cards-search" name="q" defaultValue={q} placeholder="회사, 이름, 메모 검색" className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-faint" />{filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}{tag ? <input type="hidden" name="tag" value={tag} /> : null}{company ? <input type="hidden" name="company" value={company} /> : null}<button type="submit" className="ui-action ui-action-primary px-3 sm:px-4"><Search aria-hidden="true" className="size-4 sm:hidden" /><span className="hidden sm:inline">검색</span></button></form>
      </div>

      <div className="grid gap-6 min-[900px]:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.65fr)] min-[900px]:items-start">
        <div className="min-w-0 space-y-5">
          <aside className="grid gap-4 min-[900px]:grid-cols-2">
          <Surface className="p-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><SlidersHorizontal aria-hidden="true" className="size-4 text-brand" />보기 방식</div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 min-[900px]:flex-wrap">{[
              ["전체", buildUrl({ filter: undefined, tag: undefined }) , filter === "all" && !tag],
              ["태그 없음", buildUrl({ filter: "untagged", tag: undefined }), filter === "untagged"],
              ["지난 명함", buildUrl({ filter: "archived", tag: undefined }), filter === "archived"],
            ].map(([label, href, active]) => <Link key={String(label)} href={String(href)} className={`min-h-11 shrink-0 rounded-full border px-3 py-2 text-sm font-medium ${active ? "border-brand bg-brand text-brand-ink" : "border-line-strong bg-surface text-soft hover:bg-surface-hover"}`} aria-current={active ? "page" : undefined}>{String(label)}</Link>)}</div>
          </Surface>
          {topTags.length > 0 ? <Surface className="p-4"><h2 className="text-sm font-semibold">자주 쓰는 태그</h2><div className="mt-3 flex flex-wrap gap-2">{topTags.map((item) => <Link key={item} href={buildUrl({ tag: item === tag ? undefined : item, filter: undefined })} className={`min-h-11 max-w-full rounded-full border px-3 py-2 text-sm [overflow-wrap:anywhere] ${item === tag ? "border-brand bg-brand text-brand-ink" : "border-line-strong bg-surface text-soft hover:bg-surface-hover"}`}>{item}</Link>)}</div></Surface> : null}
          </aside>

          <section aria-label="명함 결과" className="min-w-0">
          {company ? <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand/20 bg-brand-soft px-4 py-3 text-sm text-brand"><span><strong>{company}</strong> 소속만 보는 중</span><Link href={buildUrl({ company: undefined })} className="min-h-11 rounded-lg px-3 py-2 font-semibold hover:bg-surface">해제</Link></div> : null}
          {!selected ? <StateBlock state="empty" title={isFiltered ? "조건에 맞는 명함이 없습니다" : "아직 등록된 명함이 없습니다"} description={isFiltered ? "검색어나 필터를 바꿔 다시 시도해 보세요." : "첫 명함을 촬영하면 여기에 표시됩니다."} action={!isFiltered ? <Link href="/capture" className="ui-action ui-action-primary">첫 명함 등록</Link> : <Link href="/cards" className="ui-action ui-action-secondary">필터 초기화</Link>} /> : <div className="space-y-4"><ul className="grid gap-3 sm:grid-cols-2">{cards.map((card) => <CardSlip key={card.id} card={card} colleagues={(companyCounts[normalizeCompany(card.company)] ?? 0) - 1} showColleagues={!company} />)}</ul>{hasMore ? <div className="text-center"><Link href={buildUrl({ page: String(page + 1) })} className="ui-action ui-action-secondary">다음 페이지 ({page * PAGE_SIZE}/{total})</Link></div> : null}</div>}
          </section>
        </div>

        {selected ? <CardPreview card={selected} /> : null}
      </div>
    </main>
  );
}

function CardSlip({ card, colleagues, showColleagues }: { card: CardsWorkspaceCard; colleagues: number; showColleagues: boolean }) {
  const phone = safePhone(card.mobile) ?? safePhone(card.mobile2) ?? safePhone(card.phone);
  const email = safeEmail(card.email);
  return <li><article className="h-full rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-slip)] transition-transform hover:-translate-y-0.5"><Link href={`/cards/${card.id}`} className="block min-w-0"><div className="flex items-start justify-between gap-3"><h2 className="min-w-0 break-words font-semibold">{card.company ?? "회사 미상"}{showColleagues && colleagues > 0 ? <span className="ml-1.5 text-xs font-medium text-faint">외 {colleagues}명</span> : null}</h2><span className="shrink-0 text-xs text-faint">{formatDate(card.created_at)}</span></div><p className="mt-1 break-words text-sm text-soft">{[card.name, card.title, card.department].filter(Boolean).join(" · ") || "이름 미상"}</p></Link>{card.capabilities.length > 0 ? <div className="mt-3 flex flex-wrap gap-1.5">{card.capabilities.slice(0, 4).map((item) => <StatusBadge key={item} tone="brand">{item}</StatusBadge>)}{card.capabilities.length > 4 ? <StatusBadge>+{card.capabilities.length - 4}</StatusBadge> : null}</div> : null}<div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3"><div className="flex min-w-0 flex-wrap gap-2">{phone ? <a href={`tel:${phone}`} aria-label={`${card.name ?? card.company ?? "명함"} 전화 걸기`} className="ui-action ui-action-secondary px-3"><Phone aria-hidden="true" className="size-4" />전화</a> : null}{email ? <a href={`mailto:${email}`} aria-label={`${card.name ?? card.company ?? "명함"} 이메일 보내기`} className="ui-action ui-action-secondary px-3"><Mail aria-hidden="true" className="size-4" />메일</a> : null}</div><Link href={`/cards/${card.id}`} aria-label={`${card.company ?? "명함"} 상세 보기`} className="ui-icon-button ui-action ui-action-quiet"><ArrowUpRight aria-hidden="true" className="size-5" /></Link></div></article></li>;
}

function CardPreview({ card }: { card: CardsWorkspaceCard }) {
  const phone = safePhone(card.mobile) ?? safePhone(card.mobile2) ?? safePhone(card.phone);
  const email = safeEmail(card.email);
  return <aside className="hidden min-[900px]:col-start-2 min-[900px]:row-start-1 min-[900px]:block"><Surface variant="raised" className="sticky top-6 p-6"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Selected slip</p><h2 className="mt-2 break-words text-2xl font-bold tracking-tight">{card.company ?? "회사 미상"}</h2><p className="mt-1 break-words text-sm text-soft">{[card.name, card.title, card.department].filter(Boolean).join(" · ") || "이름 미상"}</p></div><Link href={`/cards/${card.id}`} className="ui-icon-button ui-action ui-action-secondary" aria-label="선택한 명함 상세 보기"><ArrowUpRight aria-hidden="true" className="size-5" /></Link></div><dl className="mt-6 space-y-3 border-t border-line pt-4 text-sm">{phone ? <div className="flex items-start justify-between gap-4"><dt className="text-soft">전화</dt><dd><a className="break-all font-medium text-brand" href={`tel:${phone}`}>{phone}</a></dd></div> : null}{email ? <div className="flex items-start justify-between gap-4"><dt className="text-soft">이메일</dt><dd><a className="break-all font-medium text-brand" href={`mailto:${email}`}>{email}</a></dd></div> : null}<div className="flex items-start justify-between gap-4"><dt className="text-soft">등록일</dt><dd>{formatDate(card.created_at)}</dd></div></dl>{card.capabilities.length > 0 ? <div className="mt-5 flex flex-wrap gap-2">{card.capabilities.map((item) => <StatusBadge key={item} tone="brand">{item}</StatusBadge>)}</div> : <p className="mt-5 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">역량 태그를 아직 확인하지 않았습니다.</p>}<Link href={`/cards/${card.id}`} className="ui-action ui-action-primary mt-6 w-full">전체 상세 보기<ArrowUpRight aria-hidden="true" className="size-4" /></Link></Surface></aside>;
}

function normalizeCompany(value: string | null): string { return (value ?? "").trim().toLowerCase(); }
function safePhone(value: string | null): string | null { return typeof value === "string" && /^[+()\d][\d ()-]{5,24}$/.test(value.trim()) ? value.trim() : null; }
function safeEmail(value: string | null): string | null { return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? value.trim() : null; }
function formatDate(iso: string): string { const date = new Date(iso); return Number.isNaN(date.getTime()) ? "" : `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`; }
