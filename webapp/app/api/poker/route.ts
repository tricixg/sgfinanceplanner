import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { verifyFinancialAccount } from "@/lib/expenses/auto-payment";
import { mapPokerSession } from "@/lib/poker/db-mappers";
import { listPokerGames, verifyPokerGame } from "@/lib/poker/games";
import { createPokerLedger } from "@/lib/poker/ledger-sync";
import { listPokerLocations, upsertPokerLocation } from "@/lib/poker/locations";
import type { PokerSessionType, TournamentResult } from "@/lib/poker/types";
import { pokerProfit } from "@/lib/poker/types";
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

  let body: {
    sessionType?: PokerSessionType;
    buyIn?: number;
    cashOut?: number;
    playedAt?: string;
    location?: string;
    venue?: string;
    tournamentName?: string;
    gameId?: string;
    eventName?: string;
    tournamentResult?: TournamentResult;
    tournamentPlace?: number | null;
    tournamentEntries?: number | null;
    amountWon?: number | null;
    hours?: number | null;
    note?: string;
    financialAccountId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sessionType: PokerSessionType =
    body.sessionType === "tournament" ? "tournament" : "cash_game";

  const buyIn = typeof body.buyIn === "number" ? body.buyIn : NaN;
  if (!Number.isFinite(buyIn) || buyIn < 0) {
    return NextResponse.json({ error: "Valid buy-in required" }, { status: 400 });
  }

  let cashOut = typeof body.cashOut === "number" ? body.cashOut : 0;
  let amountWon: number | null = null;
  let tournamentResult: TournamentResult | null = null;
  let tournamentPlace: number | null = null;
  let tournamentEntries: number | null = null;
  const tournamentName =
    typeof body.tournamentName === "string" ? body.tournamentName.trim() : "";
  const eventName =
    typeof body.eventName === "string" ? body.eventName.trim() : "";

  if (sessionType === "tournament") {
    if (!tournamentName) {
      return NextResponse.json({ error: "Tournament name is required" }, { status: 400 });
    }
    if (!eventName) {
      return NextResponse.json({ error: "Event name is required" }, { status: 400 });
    }
    if (body.tournamentResult !== "placed" && body.tournamentResult !== "busted") {
      return NextResponse.json({ error: "Result must be placed or busted" }, { status: 400 });
    }
    tournamentResult = body.tournamentResult;
    if (tournamentResult === "placed") {
      const won = typeof body.amountWon === "number" ? body.amountWon : NaN;
      if (!Number.isFinite(won) || won < 0) {
        return NextResponse.json({ error: "Valid amount won required" }, { status: 400 });
      }
      amountWon = won;
      cashOut = won;
      if (body.tournamentPlace != null) {
        const place = Number(body.tournamentPlace);
        if (Number.isFinite(place) && place >= 1) tournamentPlace = Math.round(place);
      }
    } else {
      amountWon = 0;
      cashOut = 0;
    }
    if (body.tournamentEntries != null) {
      const entries = Number(body.tournamentEntries);
      if (Number.isFinite(entries) && entries >= 1) {
        tournamentEntries = Math.round(entries);
      }
    }
  } else {
    if (!Number.isFinite(cashOut) || cashOut < 0) {
      return NextResponse.json({ error: "Valid cash-out required" }, { status: 400 });
    }
    if (!body.gameId) {
      return NextResponse.json({ error: "Game (stakes) is required" }, { status: 400 });
    }
  }

  const location =
    (typeof body.location === "string" ? body.location : body.venue ?? "").trim();

  const playedAt =
    typeof body.playedAt === "string" && body.playedAt.length >= 10
      ? body.playedAt.slice(0, 10)
      : new Date().toISOString().slice(0, 10);

  let hours: number | null = null;
  if (body.hours != null) {
    const h = Number(body.hours);
    if (Number.isFinite(h) && h >= 0) hours = h;
  }

  if (!body.financialAccountId) {
    return NextResponse.json({ error: "financialAccountId required" }, { status: 400 });
  }

  const supabase = await createAuthedSupabaseClient();

  const acctOk = await verifyFinancialAccount(
    supabase,
    user.id,
    body.financialAccountId
  );
  if (!acctOk) {
    return NextResponse.json({ error: "Invalid financial account" }, { status: 400 });
  }

  let gameId: string | null = null;
  if (sessionType === "cash_game") {
    const ok = await verifyPokerGame(supabase, user.id, body.gameId!);
    if (!ok) {
      return NextResponse.json({ error: "Invalid game" }, { status: 400 });
    }
    gameId = body.gameId!;
  }

  if (location) {
    await upsertPokerLocation(supabase, user.id, location);
  }

  const { data: row, error } = await supabase
    .from("poker_sessions")
    .insert({
      user_id: user.id,
      session_type: sessionType,
      buy_in: buyIn,
      cash_out: cashOut,
      played_at: playedAt,
      venue: location,
      location,
      tournament_name: sessionType === "tournament" ? tournamentName : null,
      game_id: gameId,
      event_name: sessionType === "tournament" ? eventName : null,
      tournament_result: tournamentResult,
      tournament_place: tournamentPlace,
      tournament_entries: tournamentEntries,
      amount_won: sessionType === "tournament" ? amountWon : null,
      hours,
      note: body.note ?? "",
      financial_account_id: body.financialAccountId,
    })
    .select("*, poker_games(*)")
    .single();

  if (error) {
    console.error("[api/poker] POST failed", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let session = mapPokerSession(row);
  const profit = pokerProfit(session);

  if (profit !== 0) {
    try {
      const txId = await createPokerLedger(supabase, user.id, session);
      if (txId) {
        const { data: updated } = await supabase
          .from("poker_sessions")
          .update({ savings_transaction_id: txId })
          .eq("id", session.id)
          .select("*")
          .single();
        if (updated) session = mapPokerSession(updated);
      }
    } catch (ledgerErr) {
      await supabase.from("poker_sessions").delete().eq("id", session.id);
      const msg = ledgerErr instanceof Error ? ledgerErr.message : "Ledger sync failed";
      console.error("[api/poker] ledger failed", msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  console.info("[api/poker] POST ok", {
    userId: user.id,
    sessionType,
    buyIn,
    cashOut,
    playedAt,
    profit,
    location: location || null,
    financialAccountId: body.financialAccountId,
  });
  return NextResponse.json({ item: session });
}
