import Link from "next/link";
import { X } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getActiveTokenRow } from "@/lib/ai/token-store";
import { CaptureClient } from "./capture-client";

export default async function CapturePage() {
  const { user, supabase } = await requireUser();

  // 검토는 /capture/review 로 옮겨졌다. 이 화면은 사진을 담기만 한다.
  const token = await getActiveTokenRow(supabase, user.id);

  return (
    <main id="main-content" className="mx-auto w-full max-w-6xl px-5 pt-5 sm:px-6 lg:px-8 lg:pt-8">
      <header className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">명함 담기</h1>
        <Link
          href="/"
          aria-label="닫기"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-line bg-surface text-soft shadow-sm focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
        >
          <X aria-hidden="true" className="size-4" />
        </Link>
      </header>

      <CaptureClient connected={!!token} />
    </main>
  );
}
