import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { addHoldingDividend, listHoldingDividends } from "@/lib/holdings/dividends";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, items: [] });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const { searchParams } = new URL(req.url);
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);
  const limit = Math.min(
    50,
    Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20)
  );

  const supabase = await createAuthedSupabaseClient();
  const { data: holding } = await supabase
    .from("holdings")
    .select("user_id")
    .eq("id", id)
    .maybeSingle();

  if (!holding || holding.user_id !== auth.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const page = await listHoldingDividends(supabase, id, { limit, offset });
    const items = page.items.map((item) => ({
      id: item.id,
      kind: "dividend",
      amount: item.amount,
      occurredAt: item.occurredAt,
      note: item.note
        ? `${item.perShare}/share — ${item.note}`
        : `${item.perShare}/share`,
      goalName: null,
      balanceAfter: null,
    }));
    return NextResponse.json({ configured: true, items, total: page.total, nextOffset: page.nextOffset });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load dividends";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const { id: holdingId } = await params;

  let body: { perShare?: number; occurredAt?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const perShare = typeof body.perShare === "number" ? body.perShare : NaN;
  if (!Number.isFinite(perShare) || perShare <= 0) {
    return NextResponse.json(
      { error: "Valid dividend per share required" },
      { status: 400 }
    );
  }

  const supabase = await createAuthedSupabaseClient();
  const { data: holding } = await supabase
    .from("holdings")
    .select("user_id")
    .eq("id", holdingId)
    .maybeSingle();

  if (!holding || holding.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const item = await addHoldingDividend(supabase, {
      userId: user.id,
      holdingId,
      perShare,
      occurredAt: body.occurredAt,
      note: body.note,
    });
    return NextResponse.json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to record dividend";
    console.error("[api/holdings/dividends] POST failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
