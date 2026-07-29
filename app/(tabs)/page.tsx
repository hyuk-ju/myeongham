import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getActiveTokenRow } from "@/lib/ai/token-store";

export default async function HomePage() {
  const { user, supabase } = await requireUser();

  // 교체된 지난 명함은 통계·목록에서 제외한다.
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
      .select("id, name, company, title, capabilities, created_at")
      .eq("is_current", true)
      .order("created_at", { ascending: false })
      .limit(5),
    // 담아만 두고 확인을 잊는 것을 막는다. card_drafts 는 cards 와 별개 테이블이라
    // 위 통계·목록에는 애초에 섞이지 않는다.
    supabase
      .from("card_drafts")
      .select("id", { count: "exact", head: true })
      .eq("status", "extracted"),
  ]);

  const total = totalResult.count ?? 0;
  const untagged = untaggedResult.count ?? 0;
  const recent = recentResult.data ?? [];
  const waitingReview = draftResult.count ?? 0;

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-8">
      <header className="mb-6">
        <h1 className="text-[22px] font-bold tracking-tight">명함첩</h1>
        <p className="mt-0.5 text-sm text-soft">찍어두면 필요할 때 찾아줍니다</p>
      </header>

      {/* 검색 → /cards 로 위임 */}
      <form action="/cards" className="mb-5">
        <div className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-sm">
          <SearchIcon className="h-4.5 w-4.5 shrink-0 text-faint" />
          <input
            name="q"
            placeholder="회사, 이름, 메모 검색"
            className="w-full bg-transparent text-[16px] outline-none placeholder:text-faint"
          />
        </div>
      </form>

      {!token && (
        <Link
          href="/settings"
          className="mb-5 block rounded-2xl border border-warn/25 bg-warn-soft px-4 py-3.5 text-sm text-warn"
        >
          <span className="font-semibold">AI 연결 필요</span> — 설정에서 ChatGPT 또는
          Claude를 연결하면 명함 분석이 시작됩니다 →
        </Link>
      )}

      {waitingReview > 0 && (
        <Link
          href="/capture/review"
          className="mb-5 block rounded-2xl border border-ok/25 bg-ok-soft px-4 py-3.5 text-sm text-ok"
        >
          <span className="font-semibold">확인 대기 {waitingReview}장</span> — 분석이 끝났습니다.
          확인하고 저장하세요 →
        </Link>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3">
        <Link
          href="/cards"
          className="rounded-2xl border border-line bg-surface p-4 shadow-sm"
        >
          <div className="text-[28px] font-bold tabular-nums tracking-tight">{total}</div>
          <div className="mt-0.5 text-[13px] text-soft">등록된 명함</div>
        </Link>
        <Link
          href="/cards?filter=untagged"
          className="rounded-2xl border border-line bg-surface p-4 shadow-sm"
        >
          <div className={`text-[28px] font-bold tabular-nums tracking-tight ${untagged > 0 ? "text-warn" : ""}`}>
            {untagged}
          </div>
          <div className="mt-0.5 text-[13px] text-soft">역량 태그 없음</div>
        </Link>
      </div>

      {/* 태그가 없으면 질문에 안 걸린다 — 회사 단위로 한 번에 채울 수 있게 안내한다 */}
      {untagged > 0 && (
        <Link
          href="/enrich"
          className="mb-5 block rounded-2xl border border-warn/25 bg-warn-soft px-4 py-3.5 text-sm text-warn"
        >
          <span className="font-semibold">역량 태그 {untagged}장 비어 있음</span> — 웹에서
          회사별로 한 번에 채우기 →
        </Link>
      )}

      <Link
        href="/ask"
        className="mb-7 flex items-center justify-between rounded-2xl bg-brand px-5 py-4 text-brand-ink shadow-md shadow-brand/25"
      >
        <div>
          <div className="font-semibold">명함에게 물어보기</div>
          <div className="mt-0.5 text-[13px] opacity-80">
            &ldquo;정밀가공 되는 회사 연락처 알려줘&rdquo;
          </div>
        </div>
        <ArrowIcon className="h-5 w-5 shrink-0 opacity-80" />
      </Link>

      <section>
        <div className="mb-2.5 flex items-baseline justify-between">
          <h2 className="text-[13px] font-semibold text-soft">최근 등록</h2>
          {total > 5 && (
            <Link href="/cards" className="text-[13px] text-brand">
              전체 보기
            </Link>
          )}
        </div>

        {recent.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line-strong bg-surface/50 px-5 py-10 text-center">
            <p className="text-sm text-soft">아직 등록된 명함이 없습니다.</p>
            <Link
              href="/capture"
              className="mt-3 inline-block rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-ink"
            >
              첫 명함 등록하기
            </Link>
          </div>
        ) : (
          <ul className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
            {recent.map((card) => (
              <li key={card.id} className="border-b border-line last:border-b-0">
                <Link href={`/cards/${card.id}`} className="block px-4 py-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-semibold">
                      {card.company ?? "회사 미상"}
                    </span>
                    <span className="shrink-0 text-xs text-faint">
                      {formatDate(card.created_at)}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-sm text-soft">
                    {[card.name, card.title].filter(Boolean).join(" · ") || "이름 미상"}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}
