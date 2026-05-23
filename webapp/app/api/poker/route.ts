import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { mapPokerSession } from "@/lib/poker/db-mappers";
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
    .select("*", { count: "exact" })
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

  return NextResponse.json({
    configured: true,
    items: page.map((r) => mapPokerSession(r)),
    nextOffset,
    total,
  });
}

export async function POST(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  let body: {
    buyIn?: number;
    cashOut?: number;
    playedAt?: string;
    venue?: string;
    hours?: number | null;
    note?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const buyIn = typeof body.buyIn === "number" ? body.buyIn : NaN;
  const cashOut = typeof body.cashOut === "number" ? body.cashOut : 0;
  if (!Number.isFinite(buyIn) || buyIn < 0) {
    return NextResponse.json({ error: "Valid buy-in required" }, { status: 400 });
  }
  if (!Number.isFinite(cashOut) || cashOut < 0) {
    return NextResponse.json({ error: "Valid cash-out required" }, { status: 400 });
  }

  const playedAt =
    typeof body.playedAt === "string" && body.playedAt.length >= 10
      ? body.playedAt.slice(0, 10)
      : new Date().toISOString().slice(0, 10);

  let hours: number | null = null;
  if (body.hours != null) {
    const h = Number(body.hours);
    if (Number.isFinite(h) && h >= 0) hours = h;
  }

  const supabase = await createAuthedSupabaseClient();
  const { data: row, error } = await supabase
    .from("poker_sessions")
    .insert({
      user_id: user.id,
      buy_in: buyIn,
      cash_out: cashOut,
      played_at: playedAt,
      venue: body.venue ?? "",
      hours,
      note: body.note ?? "",
    })
    .select("*")
    .single();

  if (error) {
    console.error("[api/poker] POST failed", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.info("[api/poker] POST ok", {
    userId: user.id,
    buyIn,
    cashOut,
    playedAt,
  });
  return NextResponse.json({ item: mapPokerSession(row) });
}
