import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { mapPokerSession } from "@/lib/poker/db-mappers";
import { reversePokerLedger } from "@/lib/poker/ledger-sync";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const { id } = await params;

  const supabase = await createAuthedSupabaseClient();

  const { data: existing, error: fetchErr } = await supabase
    .from("poker_sessions")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr) {
    console.error("[api/poker] DELETE fetch failed", fetchErr.message);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = mapPokerSession(existing);

  try {
    await reversePokerLedger(supabase, user.id, session);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ledger reversal failed";
    console.error("[api/poker] DELETE ledger reverse failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const { error } = await supabase
    .from("poker_sessions")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[api/poker] DELETE failed", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.info("[api/poker] DELETE ok", { id, userId: user.id });
  return NextResponse.json({ ok: true });
}
