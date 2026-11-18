import { apiError } from "@/lib/api/api-error";
import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { ensureUserHousehold } from "@/lib/household/bootstrap";
import { applyTransaction } from "@/lib/savings/ledger";
import { parseClientRequestId } from "@/lib/api/idempotency";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { withRequestId } from "@/lib/api/with-request-id";

type Params = { params: Promise<{ id: string }> };

export const POST = withRequestId(async function POST(req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const { id: goalId } = await params;

  let body: {
    amount?: number;
    occurredAt?: string;
    note?: string;
    kind?: "deposit" | "withdrawal" | "adjustment";
    /** Idempotency key, one per submit; a retry returns the original transaction. */
    clientRequestId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const amount = typeof body.amount === "number" ? body.amount : NaN;
  if (!Number.isFinite(amount) || amount === 0) {
    return NextResponse.json({ error: "Valid non-zero amount required" }, { status: 400 });
  }

  const clientRequestId = parseClientRequestId(body.clientRequestId);
  if (clientRequestId && typeof clientRequestId === "object") {
    return NextResponse.json({ error: clientRequestId.error }, { status: 400 });
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

  const kind = body.kind ?? (amount > 0 ? "deposit" : "withdrawal");
  let signedAmount = amount;
  if (kind === "withdrawal" && signedAmount > 0) signedAmount = -signedAmount;
  if (kind === "deposit" && signedAmount < 0) signedAmount = -signedAmount;

  try {
    const item = await applyTransaction(supabase, {
      userId: user.id,
      householdId: poolId ? householdId : null,
      accountId,
      poolId,
      goalId,
      amount: signedAmount,
      occurredAt: body.occurredAt,
      kind,
      note: body.note ?? "Goal savings",
      clientRequestId,
    });
    console.info("[api/savings/goals/deposits] recorded", {
      goalId,
      userId: user.id,
    });
    return NextResponse.json({ item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Deposit failed";
    console.error("[api/savings/goals/deposits] failed", msg);
    return apiError("api/savings/goals/[id]/deposits", msg, { fallback: "Deposit failed" });
  }
});
