import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getActiveTokenRow } from "@/lib/ai/token-store";
import { CaptureClient } from "./capture-client";

export default async function CapturePage() {
  const { user, supabase } = await requireUser();

  const [token, tagsResult] = await Promise.all([
    getActiveTokenRow(supabase, user.id),
    supabase.rpc("my_capability_tags"),
  ]);

  const knownTags = ((tagsResult.data ?? []) as { tag: string }[]).map((r) => r.tag);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pt-5">
      <header className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">명함 등록</h1>
        <Link
          href="/"
          aria-label="닫기"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-soft shadow-sm"
        >
          ✕
        </Link>
      </header>

      <CaptureClient connected={!!token} knownTags={knownTags} />
    </main>
  );
}
