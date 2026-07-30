import Link from "next/link";
import { X } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { EnrichClient, type CompanyNeed } from "./enrich-client";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

export default async function EnrichPage() {
  const { supabase } = await requireUser();

  const { data } = await supabase.rpc("companies_needing_capabilities");
  const raw: unknown = data;
  const companies: CompanyNeed[] = Array.isArray(raw)
    ? raw.flatMap((value) => {
        if (!isRecord(value)) return [];
        const record = value;
        return typeof record.company === "string" && typeof record.missing === "number" && typeof record.total === "number"
          ? [{ company: record.company, missing: record.missing, total: record.total }]
          : [];
      })
    : [];

  return (
    <main className="mx-auto w-full max-w-6xl px-5 pt-8 sm:px-6 lg:px-8 lg:pt-12">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">역량 태그 채우기</h1>
          <p className="mt-0.5 text-sm text-soft">태그가 없으면 질문에 걸리지 않습니다</p>
        </div>
        <Link
          href="/"
          aria-label="닫기"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-soft shadow-sm"
        >
          <X aria-hidden="true" className="size-4" />
        </Link>
      </header>

      <EnrichClient companies={companies} />
    </main>
  );
}
