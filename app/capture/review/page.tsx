import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ReviewClient } from "./review-client";

export default async function ReviewPage() {
  const { supabase } = await requireUser();

  const tagsResult = await supabase.rpc("my_capability_tags");
  const knownTags = ((tagsResult.data ?? []) as { tag: string }[]).map((r) => r.tag);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-5">
      <header className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">명함 확인</h1>
        <Link
          href="/capture"
          aria-label="촬영 화면으로"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-soft shadow-sm"
        >
          ✕
        </Link>
      </header>

      <ReviewClient knownTags={knownTags} />
    </main>
  );
}
