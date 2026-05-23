import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { ensureUserHousehold } from "@/lib/household/bootstrap";
import { applyTransaction } from "@/lib/savings/ledger";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const { id: goalId } = await params;

  let body: { amount?: number; occurredAt?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const amount = typeof body.amount === "number" ? body.amount : NaN;
  if (!Number.isFinite(amount) || amount === 0) {
    return NextResponse.json({ error: "Valid non-zero amount required" }, { status: 400 });
  }

  const supabase = await createAuthedSupabaseClient();
  const householdId = await ensureUserHousehold(supabase, user.id);

  const { data: goal, error: goalErr } = await supabase
    .from("savings_goals")
    .select("*")
    .eq("id", goalId)
    .maybeSingle();

  if (goalErr || !goal) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  if (goal.scope === "individual" && goal.owner_user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (goal.scope === "shared" && goal.household_id !== householdId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const accountId = goal.linked_account_id as string | null;
  const poolId = goal.linked_pool_id as string | null;

  if (!accountId && !poolId) {
    return NextResponse.json(
      { error: "Link this goal to an account or shared pool first" },
      { status: 400 }
    );
  }

  try {
    const item = await applyTransaction(supabase, {
      userId: user.id,
      householdId: poolId ? householdId : null,
      accountId,
      poolId,
      goalId,
      amount: amount > 0 ? amount : amount,
      occurredAt: body.occurredAt,
      kind: amount > 0 ? "deposit" : "withdrawal",
      note: body.note ?? "Goal savings",
    });
    console.info("[api/savings/goals/deposits] recorded", {
      goalId,
      amount,
      userId: user.id,
    });
    return NextResponse.json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Deposit failed";
    console.error("[api/savings/goals/deposits] failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
