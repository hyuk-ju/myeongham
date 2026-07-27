import { requireUser } from "@/lib/auth";
import { getActiveTokenRow } from "@/lib/ai/token-store";
import Link from "next/link";
import { AskClient } from "./ask-client";

export default async function AskPage() {
  const { user, supabase } = await requireUser();

  const [token, countResult] = await Promise.all([
    getActiveTokenRow(supabase, user.id),
    supabase.from("cards").select("id", { count: "exact", head: true }),
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-8">
      <header className="mb-5">
        <h1 className="text-[22px] font-bold tracking-tight">물어보기</h1>
        <p className="mt-0.5 text-sm text-soft">
          등록한 명함 {countResult.count ?? 0}장에서 찾아 표로 정리해 드립니다
        </p>
      </header>

      {!token ? (
        <div className="rounded-2xl border border-warn/25 bg-warn-soft px-4 py-4 text-sm text-warn">
          질의에는 AI 분석이 필요합니다.{" "}
          <Link href="/settings" className="font-semibold underline">
            설정에서 ChatGPT 또는 Claude를 연결
          </Link>
          하세요.
        </div>
      ) : (
        <AskClient />
      )}
    </main>
  );
}
