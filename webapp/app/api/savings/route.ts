import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { ensureUserHousehold } from "@/lib/household/bootstrap";
import { loadAccountsBundle } from "@/lib/savings/load-accounts";
import { loadSavingsBundle, mergeSavingsSnapshots } from "@/lib/savings/load-bundle";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import type { SavingsGoal, SavingsPool } from "@/lib/savings/types";

export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  try {
    const supabase = await createAuthedSupabaseClient();
    const started = Date.now();
    const [accountsBundle, savingsBundle] = await Promise.all([
      loadAccountsBundle(supabase, user.id),
      loadSavingsBundle(supabase, user.id, []),
    ]);
    console.info("[api/savings] GET loaded", {
      userId: user.id,
      loadMs: Date.now() - started,
    });
    return NextResponse.json({
      configured: true,
      ...savingsBundle,
      totals: mergeSavingsSnapshots(accountsBundle.totals, savingsBundle),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load savings";
    console.error("[api/savings] GET failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

type PutBody = {
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

  if (body.pools !== undefined) {
    const pools = body.pools;
    await supabase.from("savings_pools").delete().eq("household_id", householdId);
    if (pools.length > 0) {
      const { error } = await supabase.from("savings_pools").insert(
        pools.map((p, i) => ({
          household_id: householdId,
          name: p.name ?? "",
          balance: p.balance ?? 0,
          notes: p.notes ?? "",
          include_in_savings: p.includeInSavings !== false,
          sort_order: p.sortOrder ?? i,
          updated_at: new Date().toISOString(),
        }))
      );
      if (error) {
        console.error("[api/savings] pools upsert failed", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  }

  if (body.goals !== undefined) {
    const goals = body.goals;
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
          start_date: g.startDate ?? null,
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
  }

  console.info("[api/savings] PUT ok", {
    userId: user.id,
    pools: body.pools?.length,
    goals: body.goals?.length,
  });

  const reloadStarted = Date.now();
  const [accountsBundle, savingsBundle] = await Promise.all([
    loadAccountsBundle(supabase, user.id),
    loadSavingsBundle(supabase, user.id, []),
  ]);
  console.info("[api/savings] PUT reloaded", {
    userId: user.id,
    loadMs: Date.now() - reloadStarted,
  });
  return NextResponse.json({
    ...savingsBundle,
    totals: mergeSavingsSnapshots(accountsBundle.totals, savingsBundle),
  });
}
