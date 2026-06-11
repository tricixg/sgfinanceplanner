import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { deletePokerGame, updatePokerGame } from "@/lib/poker/games";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

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
    const item = await updatePokerGame(supabase, auth.user.id, id, {
      name: body.name ?? "",
      smallBlind,
      bigBlind,
      ante,
    });
    console.info("[api/poker/games] PATCH ok", { id, userId: auth.user.id });
    return NextResponse.json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update game";
    console.error("[api/poker/games] PATCH failed", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const supabase = await createAuthedSupabaseClient();
  try {
    await deletePokerGame(supabase, auth.user.id, id);
    console.info("[api/poker/games] DELETE ok", { id, userId: auth.user.id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete game";
    const status = msg.includes("past sessions") ? 409 : 400;
    console.error("[api/poker/games] DELETE failed", msg);
    return NextResponse.json({ error: msg }, { status });
  }
}
