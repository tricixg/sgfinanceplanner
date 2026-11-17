import { apiError } from "@/lib/api/api-error";
import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { ensureUserHousehold } from "@/lib/household/bootstrap";
import { loadAccountsBundle } from "@/lib/savings/load-accounts";
import { loadSavingsBundle, mergeSavingsSnapshots } from "@/lib/savings/load-bundle";
import { loadFundsBundle } from "@/lib/funds/load";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { SaveConfigError, saveGoalsConfig, savePoolsConfig } from "@/lib/savings/save-config";
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
    const [accountsBundle, savingsBundle, fundsBundle] = await Promise.all([
      loadAccountsBundle(supabase, user.id),
      loadSavingsBundle(supabase, user.id, []),
      loadFundsBundle(supabase, user.id),
    ]);
    console.info("[api/savings] GET loaded", {
      userId: user.id,
      loadMs: Date.now() - started,
    });
    return NextResponse.json({
      configured: true,
      ...savingsBundle,
      totals: mergeSavingsSnapshots(
        accountsBundle.totals,
        savingsBundle,
        fundsBundle.totals.fundsBalanceTotal
      ),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load savings";
    console.error("[api/savings] GET failed", msg);
    return apiError("api/savings", msg, { fallback: "Failed to load savings" });
  }
}

/**
 * Rows are matched by id and updated in place. Rows are only deleted when
 * their id is listed in `deletedPoolIds` / `deletedGoalIds`; being absent from
 * `pools` / `goals` never deletes anything.
 */
type PutBody = {
  pools?: Partial<SavingsPool>[];
  goals?: Partial<SavingsGoal>[];
  deletedPoolIds?: string[];
  deletedGoalIds?: string[];
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

  try {
    if (body.pools !== undefined) {
      await savePoolsConfig(supabase, householdId, body.pools, body.deletedPoolIds);
    }
    if (body.goals !== undefined) {
      await saveGoalsConfig(supabase, user.id, householdId, body.goals, body.deletedGoalIds);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save";
    const status = e instanceof SaveConfigError ? e.status : 500;
    console.error("[api/savings] PUT failed", msg);
    return apiError("api/savings", msg, { status, fallback: "Failed to save" });
  }

  console.info("[api/savings] PUT ok", {
    userId: user.id,
    pools: body.pools?.length,
    goals: body.goals?.length,
  });

  const reloadStarted = Date.now();
  const [accountsBundle, savingsBundle, fundsBundle] = await Promise.all([
    loadAccountsBundle(supabase, user.id),
    loadSavingsBundle(supabase, user.id, []),
    loadFundsBundle(supabase, user.id),
  ]);
  console.info("[api/savings] PUT reloaded", {
    userId: user.id,
    loadMs: Date.now() - reloadStarted,
  });
  return NextResponse.json({
    ...savingsBundle,
    totals: mergeSavingsSnapshots(
      accountsBundle.totals,
      savingsBundle,
      fundsBundle.totals.fundsBalanceTotal
    ),
  });
}
