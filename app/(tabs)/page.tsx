import Link from "next/link";
import { ArrowRight, CircleAlert, Clock3, Mail, Phone, Search, Sparkles } from "lucide-react";
import { StateBlock, StatusBadge, Surface } from "@/components/ui";

export type HomeDraftStatus = "pending" | "processing" | "failed" | "extracted";

export type HomeRecentCard = Readonly<{
  id: string;
  name: string | null;
  company: string | null;
  title: string | null;
  capabilities: readonly string[];
  created_at: string;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
}>;

export type HomeViewProps = Readonly<{
  total: number;
  untagged: number;
  aiAvailable: boolean;
  drafts: Readonly<Record<HomeDraftStatus, number>>;
  recent: readonly HomeRecentCard[];
}>;

type WorkItem = Readonly<{
  key: string;
  title: string;
  description: string;
  href: string;
  action: string;
  tone: "warning" | "danger" | "brand" | "success";
  count?: number;
}>;

export default async function HomePage() {
  const { requireUser } = await import("@/lib/auth");
  const { getActiveTokenRow } = await import("@/lib/ai/token-store");
  const { user, supabase } = await requireUser();
  const [totalResult, untaggedResult, token, recentResult, draftResult] = await Promise.all([
    supabase.from("cards").select("id", { count: "exact", head: true }).eq("is_current", true),
    supabase
      .from("cards")
      .select("id", { count: "exact", head: true })
      .eq("is_current", true)
      .eq("capabilities", "{}"),
    getActiveTokenRow(supabase, user.id),
    supabase
      .from("cards")
      .select("id, name, company, title, capabilities, created_at, phone, mobile, email")
      .eq("is_current", true)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("card_drafts").select("status", { count: "exact" }),
  ]);

  const drafts: Record<HomeDraftStatus, number> = {
    pending: 0,
    processing: 0,
    failed: 0,
    extracted: 0,
  };
  for (const row of (draftResult.data ?? []) as ReadonlyArray<{ status?: string | null }>) {
    if (row.status && row.status in drafts) {
      const status = row.status as HomeDraftStatus;
      drafts[status] += 1;
    }
  }

  return (
    <HomeView
      total={totalResult.count ?? 0}
      untagged={untaggedResult.count ?? 0}
      aiAvailable={Boolean(token)}
      drafts={drafts}
      recent={(recentResult.data ?? []) as HomeRecentCard[]}
    />
  );
}

export function HomeView({ total, untagged, aiAvailable, drafts, recent }: HomeViewProps) {
  const work = getWorkItems({ aiAvailable, drafts, untagged });
  const firstWork = work[0];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-10 pt-8 sm:px-6 lg:px-8 lg:pt-12">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-brand">오늘의 명함첩</p>
          <h1 className="mt-1 text-[clamp(1.75rem,4vw,2.5rem)] font-bold tracking-tight">명함첩</h1>
          <p className="mt-1 text-sm text-soft">찍어두면 필요할 때 찾아줍니다.</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface px-4 py-3 text-right shadow-sm">
          <p className="text-xs font-semibold text-soft">등록된 명함</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums">{total}</p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <section aria-labelledby="today-work" className="space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Next action</p>
              <h2 id="today-work" className="mt-1 text-xl font-bold tracking-tight">오늘 할 일</h2>
            </div>
            {firstWork ? <StatusBadge tone={firstWork.tone}>{firstWork.action}</StatusBadge> : null}
          </div>

          {firstWork ? (
            <Surface variant="slip" className="overflow-hidden border-brand/20">
              <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
                <div className="flex min-w-0 gap-3">
                  <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                    {firstWork.tone === "danger" ? <CircleAlert aria-hidden="true" className="size-5" /> : <Clock3 aria-hidden="true" className="size-5" />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-lg font-semibold">{firstWork.title}</p>
                    <p className="mt-1 max-w-xl text-sm text-soft">{firstWork.description}</p>
                  </div>
                </div>
                <Link href={firstWork.href} className="ui-action ui-action-primary shrink-0">
                  <span>{firstWork.action}</span>
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </div>
              {work.length > 1 ? (
                <div className="border-t border-line bg-paper/60 px-5 py-3 text-sm text-soft sm:px-6">
                  이어서 확인할 일 {work.length - 1}건이 있습니다.
                </div>
              ) : null}
            </Surface>
          ) : (
            <StateBlock
              state="success"
              title="오늘은 모두 정리됐어요"
              description="새 명함을 촬영하거나 명함첩에서 필요한 사람을 찾아보세요."
              action={<Link href="/capture" className="ui-action ui-action-primary">새 명함 등록</Link>}
            />
          )}

          {work.length > 1 ? (
            <ul className="grid gap-3 sm:grid-cols-2" aria-label="추가 작업">
              {work.slice(1).map((item) => (
                <li key={item.key}>
                  <Link href={item.href} className="flex h-full items-start gap-3 rounded-2xl border border-line bg-surface p-4 transition-colors hover:bg-surface-hover">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-hover text-soft"><Sparkles aria-hidden="true" className="size-4" /></span>
                    <span className="min-w-0"><span className="block font-semibold">{item.title}</span><span className="mt-1 block text-sm text-soft">{item.description}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <aside className="space-y-4">
          <form action="/cards" className="rounded-2xl border border-line bg-surface p-3 shadow-sm">
            <label htmlFor="home-search" className="sr-only">명함 검색</label>
            <div className="flex items-center gap-2.5 rounded-xl border border-line-strong bg-paper px-3 py-2.5">
              <Search aria-hidden="true" className="size-4 shrink-0 text-faint" />
              <input id="home-search" name="q" placeholder="회사, 이름, 메모 검색" className="w-full min-w-0 bg-transparent text-base outline-none placeholder:text-faint" />
            </div>
          </form>
          <Surface className="p-5">
            <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">상태 요약</h2><Link href="/cards" className="text-sm font-medium text-brand">명함 보기</Link></div>
            <dl className="mt-4 grid grid-cols-2 gap-3">
              <Metric label="역량 태그 없음" value={untagged} tone={untagged > 0 ? "warning" : "success"} />
              <Metric label="확인 대기" value={drafts.extracted} tone={drafts.extracted > 0 ? "brand" : "neutral"} />
              <Metric label="처리 중" value={drafts.processing + drafts.pending} tone="neutral" />
              <Metric label="처리 실패" value={drafts.failed} tone={drafts.failed > 0 ? "danger" : "neutral"} />
            </dl>
            <p className="mt-4 flex items-center gap-2 border-t border-line pt-4 text-sm text-soft">
              <span className={`size-2 rounded-full ${aiAvailable ? "bg-ok" : "bg-warn"}`} aria-hidden="true" />
              {aiAvailable ? "AI 연결됨" : "AI 연결 필요"}
            </p>
          </Surface>
        </aside>
      </div>

      <section aria-labelledby="recent-cards" className="mt-10">
        <div className="mb-3 flex items-baseline justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-soft">Recent slips</p><h2 id="recent-cards" className="mt-1 text-xl font-bold tracking-tight">최근 등록</h2></div>{total > 5 ? <Link href="/cards" className="text-sm font-medium text-brand">전체 보기</Link> : null}</div>
        {recent.length === 0 ? (
          <StateBlock state="empty" title="아직 등록된 명함이 없습니다" description="첫 명함을 촬영하면 최근 등록 목록에 표시됩니다." action={<Link href="/capture" className="ui-action ui-action-primary">첫 명함 등록</Link>} />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((card) => <RecentSlip key={card.id} card={card} />)}
          </ul>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "warning" | "success" | "brand" | "danger" | "neutral" }) {
  return <div className="rounded-xl border border-line bg-paper px-3 py-3"><dt className="text-xs text-soft">{label}</dt><dd className={`mt-1 text-xl font-bold tabular-nums ${tone === "warning" ? "text-warn" : tone === "success" ? "text-ok" : tone === "brand" ? "text-brand" : tone === "danger" ? "text-danger" : "text-ink"}`}>{value}</dd></div>;
}

function RecentSlip({ card }: { card: HomeRecentCard }) {
  const phone = validPhone(card.mobile) ? card.mobile : validPhone(card.phone) ? card.phone : null;
  const email = validEmail(card.email) ? card.email : null;
  return <li><article className="h-full rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-slip)] transition-transform hover:-translate-y-0.5"><Link href={`/cards/${card.id}`} className="block min-w-0"><div className="flex items-start justify-between gap-3"><span className="min-w-0 break-words font-semibold">{card.company ?? "회사 미상"}</span><span className="shrink-0 text-xs text-faint">{formatDate(card.created_at)}</span></div><p className="mt-1 break-words text-sm text-soft">{[card.name, card.title].filter(Boolean).join(" · ") || "이름 미상"}</p></Link>{card.capabilities.length > 0 ? <div className="mt-3 flex flex-wrap gap-1.5">{card.capabilities.slice(0, 3).map((tag) => <StatusBadge key={tag} tone="brand">{tag}</StatusBadge>)}</div> : null}<div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">{phone ? <a className="ui-action ui-action-secondary flex-1" href={`tel:${phone}`} aria-label={`${card.name ?? card.company ?? "명함"} 전화 걸기`}><Phone aria-hidden="true" className="size-4" />전화</a> : null}{email ? <a className="ui-action ui-action-secondary flex-1" href={`mailto:${email}`} aria-label={`${card.name ?? card.company ?? "명함"} 이메일 보내기`}><Mail aria-hidden="true" className="size-4" />메일</a> : null}</div></article></li>;
}

function getWorkItems({ aiAvailable, drafts, untagged }: Pick<HomeViewProps, "aiAvailable" | "drafts" | "untagged">): WorkItem[] {
  const work: WorkItem[] = [];
  if (drafts.failed > 0) work.push({ key: "failed", title: `실패한 분석 ${drafts.failed}장`, description: "오류 원인을 확인하고 다시 시도하거나 수동으로 검토하세요.", href: "/capture/review", action: "복구 시작", tone: "danger", count: drafts.failed });
  if (drafts.extracted > 0) work.push({ key: "extracted", title: `확인 대기 ${drafts.extracted}장`, description: "분석이 끝난 명함을 확인하고 저장하세요.", href: "/capture/review", action: "검토하기", tone: "brand", count: drafts.extracted });
  if (drafts.processing + drafts.pending > 0) work.push({ key: "processing", title: `처리 중인 명함 ${drafts.processing + drafts.pending}장`, description: "대기열에서 진행 상태를 확인하고 이어서 처리하세요.", href: "/capture/review", action: "대기열 보기", tone: "warning", count: drafts.processing + drafts.pending });
  if (untagged > 0) work.push({ key: "untagged", title: `역량 태그가 비어 있는 명함 ${untagged}장`, description: "회사 정보를 확인해 질문 검색의 정확도를 높이세요.", href: "/enrich", action: "태그 채우기", tone: "warning", count: untagged });
  if (!aiAvailable) work.push({ key: "ai", title: "AI 연결이 필요합니다", description: "명함 분석과 질문을 쓰려면 설정에서 제공자를 연결하세요.", href: "/settings", action: "설정 열기", tone: "warning" });
  return work;
}

function validPhone(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[+()\d][\d ()-]{5,24}$/.test(value.trim());
}

function validEmail(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}.${d.getDate()}`;
}
