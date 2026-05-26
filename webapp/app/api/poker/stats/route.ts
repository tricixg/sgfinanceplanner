import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { mapPokerSession } from "@/lib/poker/db-mappers";
import { buildPokerStats } from "@/lib/poker/stats";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

const MAX_SESSIONS = 5000;

export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, stats: null });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const supabase = await createAuthedSupabaseClient();
  const { data: rows, error } = await supabase
    .from("poker_sessions")
    .select("*, poker_games(*)")
    .eq("user_id", auth.user.id)
    .order("played_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(MAX_SESSIONS);

  if (error) {
    console.error("[api/poker/stats] GET failed", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const sessions = (rows ?? []).map((r) => mapPokerSession(r));
  const stats = buildPokerStats(sessions);

  console.info("[api/poker/stats] built", {
    userId: auth.user.id,
    sessions: sessions.length,
    totalNet: stats.overview.totalNetProfit,
  });

  return NextResponse.json({ configured: true, stats });
}
