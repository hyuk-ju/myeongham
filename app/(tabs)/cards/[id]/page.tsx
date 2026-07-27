import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { CardDetail } from "./card-detail";

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { supabase } = await requireUser();
  const { id } = await params;

  const [{ data: card }, tagsResult] = await Promise.all([
    supabase.from("cards").select("*").eq("id", id).maybeSingle(),
    supabase.rpc("my_capability_tags"),
  ]);

  if (!card) notFound();

  const [{ data: signed }, colleaguesResult, historyResult, replacedByResult] =
    await Promise.all([
      // private 버킷이므로 signed URL 로만 이미지에 접근한다.
      supabase.storage.from("card-images").createSignedUrl(card.image_path, 3600),
      // 같은 회사의 다른 사람들
      card.company
        ? supabase
            .from("cards")
            .select("id, name, title, department")
            .ilike("company", card.company)
            .eq("is_current", true)
            .neq("id", card.id)
            .limit(20)
        : Promise.resolve({ data: [] }),
      // 이 명함이 대체한 지난 명함
      card.supersedes_id
        ? supabase
            .from("cards")
            .select("id, name, title, department, company, created_at")
            .eq("id", card.supersedes_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      // 이 명함을 대체한 새 명함 (지난 명함을 보고 있을 때)
      supabase
        .from("cards")
        .select("id, name, title, created_at")
        .eq("supersedes_id", card.id)
        .maybeSingle(),
    ]);

  const knownTags = ((tagsResult.data ?? []) as { tag: string }[]).map((r) => r.tag);

  return (
    <CardDetail
      card={card}
      imageUrl={signed?.signedUrl ?? null}
      knownTags={knownTags}
      colleagues={colleaguesResult.data ?? []}
      previousCard={historyResult.data ?? null}
      replacedBy={replacedByResult.data ?? null}
    />
  );
}
