import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { ensureUserHousehold } from "@/lib/household/bootstrap";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { mapTransaction } from "@/lib/savings/db-mappers";

export async function GET(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, items: [], total: 0 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const { searchParams } = new URL(req.url);
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "30", 10) || 30));

  const supabase = await createAuthedSupabaseClient();
  const householdId = await ensureUserHousehold(supabase, auth.user.id);

  // Get all shared goal IDs + names for this household
  const { data: sharedGoals } = await supabase
    .from("savings_goals")
    .select("id, name")
    .eq("scope", "shared")
    .eq("household_id", householdId);

  const goalIds = (sharedGoals ?? []).map((g) => g.id);
  const goalNameMap = new Map((sharedGoals ?? []).map((g) => [g.id, g.name as string]));

  if (goalIds.length === 0) {
    return NextResponse.json({ configured: true, items: [], total: 0, nextOffset: null });
  }

  const { data, error, count } = await supabase
    .from("savings_transactions")
    .select("*", { count: "exact" })
    .in("goal_id", goalIds)
    .order("occurred_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[api/savings/shared-contributions] query failed", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = (data ?? []).map((r) => {
    const tx = mapTransaction(r);
    return { ...tx, goalName: goalNameMap.get(tx.goalId ?? "") ?? tx.goalName };
  });

  console.info("[api/savings/shared-contributions] GET", {
    userId: auth.user.id,
    householdId,
    count,
    offset,
  });

  return NextResponse.json({
    configured: true,
    items,
    total: count ?? 0,
    nextOffset: offset + items.length < (count ?? 0) ? offset + limit : null,
  });
}
