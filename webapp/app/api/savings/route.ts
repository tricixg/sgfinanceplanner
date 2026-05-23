import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { ensureUserHousehold } from "@/lib/household/bootstrap";
import { loadSavingsBundle } from "@/lib/savings/load-bundle";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import type { SavingsGoal, SavingsPool, UserSavingsAccount } from "@/lib/savings/types";

export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  try {
    const supabase = await createAuthedSupabaseClient();
    const bundle = await loadSavingsBundle(supabase, user.id);
    return NextResponse.json({ configured: true, ...bundle });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load savings";
    console.error("[api/savings] GET failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

type PutBody = {
  accounts?: Partial<UserSavingsAccount>[];
  pools?: Partial<SavingsPool>[];
  goals?: Partial<SavingsGoal>[];
};

export async function PUT(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  let body: PutBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = await createAuthedSupabaseClient();
  const householdId = await ensureUserHousehold(supabase, user.id);

  const accounts = body.accounts ?? [];
  await supabase.from("user_savings_accounts").delete().eq("user_id", user.id);
  if (accounts.length > 0) {
    const { error } = await supabase.from("user_savings_accounts").insert(
      accounts.map((a, i) => ({
        id: a.id?.match(/^[0-9a-f-]{36}$/i) ? a.id : undefined,
        user_id: user.id,
        name: a.name ?? "",
        balance: a.balance ?? 0,
        notes: a.notes ?? "",
        sort_order: a.sortOrder ?? i,
        updated_at: new Date().toISOString(),
      }))
    );
    if (error) {
      console.error("[api/savings] accounts upsert failed", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const pools = body.pools ?? [];
  await supabase.from("savings_pools").delete().eq("household_id", householdId);
  if (pools.length > 0) {
    const { error } = await supabase.from("savings_pools").insert(
      pools.map((p, i) => ({
        household_id: householdId,
        name: p.name ?? "",
        balance: p.balance ?? 0,
        notes: p.notes ?? "",
        sort_order: p.sortOrder ?? i,
        updated_at: new Date().toISOString(),
      }))
    );
    if (error) {
      console.error("[api/savings] pools upsert failed", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  await supabase
    .from("savings_goals")
    .delete()
    .eq("owner_user_id", user.id)
    .eq("scope", "individual");
  await supabase
    .from("savings_goals")
    .delete()
    .eq("household_id", householdId)
    .eq("scope", "shared");

  const goals = body.goals ?? [];
  if (goals.length > 0) {
    const rows = goals.map((g, i) => {
      const scope = g.scope === "shared" ? "shared" : "individual";
      return {
        scope,
        owner_user_id: scope === "individual" ? user.id : null,
        household_id: scope === "shared" ? householdId : null,
        name: g.name ?? "",
        target_amount: g.targetAmount ?? 0,
        saved_amount: g.savedAmount ?? 0,
        target_date: g.targetDate ?? null,
        monthly_contribution: g.monthlyContribution ?? 0,
        where_label: g.whereLabel ?? "",
        linked_account_id: g.linkedAccountId ?? null,
        linked_pool_id: g.linkedPoolId ?? null,
        sort_order: g.sortOrder ?? i,
        updated_at: new Date().toISOString(),
      };
    });
    const { error } = await supabase.from("savings_goals").insert(rows);
    if (error) {
      console.error("[api/savings] goals upsert failed", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  console.info("[api/savings] PUT ok", {
    userId: user.id,
    accounts: accounts.length,
    pools: pools.length,
    goals: goals.length,
  });

  const bundle = await loadSavingsBundle(supabase, user.id);
  return NextResponse.json(bundle);
}
