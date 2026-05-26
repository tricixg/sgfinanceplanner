import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { verifyFinancialAccount } from "@/lib/expenses/auto-payment";
import { mapPokerSession } from "@/lib/poker/db-mappers";
import { listPokerGames } from "@/lib/poker/games";
import { listPokerLocations } from "@/lib/poker/locations";
import { insertPokerSession, type PokerSessionBody } from "@/lib/poker/save-session";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, items: [], nextOffset: null, total: 0 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const offset = Math.max(
    0,
    parseInt(searchParams.get("offset") ?? "0", 10) || 0
  );
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
  );

  const supabase = await createAuthedSupabaseClient();
  let query = supabase
    .from("poker_sessions")
    .select("*, poker_games(*)", { count: "exact" })
    .eq("user_id", user.id)
    .order("played_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);

  if (from) query = query.gte("played_at", from);
  if (to) query = query.lte("played_at", to);

  const { data: rows, error, count } = await query;

  if (error) {
    console.error("[api/poker] GET failed", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const page = rows ?? [];
  const total = count ?? 0;
  const nextOffset = offset + page.length < total ? offset + page.length : null;

  console.info("[api/poker] GET", {
    userId: user.id,
    count: page.length,
    offset,
    total,
  });

  const [locations, games] = await Promise.all([
    listPokerLocations(supabase, user.id),
    listPokerGames(supabase, user.id),
  ]);

  return NextResponse.json({
    configured: true,
    items: page.map((r) => mapPokerSession(r)),
    nextOffset,
    total,
    locations,
    games,
  });
}

export async function POST(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  let body: PokerSessionBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = await createAuthedSupabaseClient();

  if (body.financialAccountId) {
    const acctOk = await verifyFinancialAccount(
      supabase,
      user.id,
      body.financialAccountId
    );
    if (!acctOk) {
      return NextResponse.json({ error: "Invalid financial account" }, { status: 400 });
    }
  }

  const result = await insertPokerSession(supabase, user.id, body);
  if ("error" in result) {
    const status = result.error === "Not found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ item: result.session });
}
