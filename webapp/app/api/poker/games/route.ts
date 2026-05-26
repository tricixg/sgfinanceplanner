import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { createPokerGame, listPokerGames } from "@/lib/poker/games";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, items: [] });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const supabase = await createAuthedSupabaseClient();
  const items = await listPokerGames(supabase, auth.user.id);
  console.info("[api/poker/games] GET", { userId: auth.user.id, count: items.length });
  return NextResponse.json({ configured: true, items });
}

export async function POST(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  let body: {
    name?: string;
    smallBlind?: number;
    bigBlind?: number;
    ante?: number | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const smallBlind = Number(body.smallBlind);
  const bigBlind = Number(body.bigBlind);
  if (!Number.isFinite(smallBlind) || smallBlind < 0) {
    return NextResponse.json({ error: "Valid small blind required" }, { status: 400 });
  }
  if (!Number.isFinite(bigBlind) || bigBlind < 0) {
    return NextResponse.json({ error: "Valid big blind required" }, { status: 400 });
  }

  let ante: number | null = null;
  if (body.ante != null) {
    const a = Number(body.ante);
    if (Number.isFinite(a) && a >= 0) ante = a;
  }

  const supabase = await createAuthedSupabaseClient();
  try {
    const item = await createPokerGame(supabase, auth.user.id, {
      name: body.name ?? "",
      smallBlind,
      bigBlind,
      ante,
    });
    return NextResponse.json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create game";
    console.error("[api/poker/games] POST failed", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
