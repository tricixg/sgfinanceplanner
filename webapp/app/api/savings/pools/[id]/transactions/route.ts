import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { ensureUserHousehold } from "@/lib/household/bootstrap";
import { applyTransaction, listPoolTransactions } from "@/lib/savings/ledger";
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
  const householdId = await ensureUserHousehold(supabase, auth.user.id);

  const { data: pool } = await supabase
    .from("savings_pools")
    .select("household_id")
    .eq("id", id)
    .maybeSingle();

  if (!pool || pool.household_id !== householdId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const page = await listPoolTransactions(supabase, id, { limit, offset });
    return NextResponse.json({ configured: true, ...page });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load transactions";
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
  const { id: poolId } = await params;

  let body: {
    amount?: number;
    occurredAt?: string;
    kind?: "deposit" | "withdrawal" | "adjustment";
    note?: string;
    goalId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawAmount = typeof body.amount === "number" ? body.amount : NaN;
  if (!Number.isFinite(rawAmount) || rawAmount === 0) {
    return NextResponse.json({ error: "Valid non-zero amount required" }, { status: 400 });
  }

  const supabase = await createAuthedSupabaseClient();
  const householdId = await ensureUserHousehold(supabase, user.id);

  const { data: pool } = await supabase
    .from("savings_pools")
    .select("household_id")
    .eq("id", poolId)
    .maybeSingle();

  if (!pool || pool.household_id !== householdId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const kind = body.kind ?? "deposit";
  let amount = rawAmount;
  if (kind === "adjustment") {
    // Signed delta applied as-is.
  } else if (kind === "withdrawal" && amount > 0) {
    amount = -amount;
  } else if (kind === "deposit" && amount < 0) {
    amount = -amount;
  }

  try {
    const item = await applyTransaction(supabase, {
      userId: user.id,
      householdId,
      poolId,
      amount,
      occurredAt: body.occurredAt,
      kind,
      note: body.note,
      goalId: body.goalId ?? null,
    });
    return NextResponse.json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Transaction failed";
    console.error("[api/savings/pools/transactions] POST failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
