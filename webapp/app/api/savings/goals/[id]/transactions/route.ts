import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { ensureUserHousehold } from "@/lib/household/bootstrap";
import { listGoalTransactions } from "@/lib/savings/ledger";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, items: [] });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { id: goalId } = await params;

  const { searchParams } = new URL(req.url);
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);
  const limit = Math.min(
    50,
    Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20)
  );

  const supabase = await createAuthedSupabaseClient();
  const householdId = await ensureUserHousehold(supabase, auth.user.id);

  const { data: goal } = await supabase
    .from("savings_goals")
    .select("scope, owner_user_id, household_id")
    .eq("id", goalId)
    .maybeSingle();

  if (!goal) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (goal.scope === "individual" && goal.owner_user_id !== auth.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (goal.scope === "shared" && goal.household_id !== householdId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const page = await listGoalTransactions(supabase, goalId, { limit, offset });
    return NextResponse.json({ configured: true, ...page });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load transactions";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
