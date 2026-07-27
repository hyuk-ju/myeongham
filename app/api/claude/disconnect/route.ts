import { NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { deleteToken } from "@/lib/ai/token-store";

export async function POST() {
  const auth = await getAuthorizedUser();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await deleteToken(auth.supabase, auth.user.id, "anthropic-claude");
  return NextResponse.json({ ok: true });
}
