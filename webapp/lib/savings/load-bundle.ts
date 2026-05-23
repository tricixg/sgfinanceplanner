import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSavingsSnapshot } from "@/lib/finance/savings-totals";
import { ensureUserHousehold } from "@/lib/household/bootstrap";
import type { SavingsBundle } from "@/lib/savings/types";
import { mapAccount, mapGoal, mapPool } from "@/lib/savings/db-mappers";

export async function loadSavingsBundle(
  supabase: SupabaseClient,
  userId: string
): Promise<SavingsBundle> {
  const householdId = await ensureUserHousehold(supabase, userId);

  const { data: members } = await supabase
    .from("household_members")
    .select("user_id")
    .eq("household_id", householdId);

  const paired = (members?.length ?? 0) > 1;

  const { data: accountRows, error: acctErr } = await supabase
    .from("user_savings_accounts")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  if (acctErr) {
    console.error("[savings] load accounts failed", acctErr.message);
    throw acctErr;
  }

  const { data: poolRows, error: poolErr } = await supabase
    .from("savings_pools")
    .select("*")
    .eq("household_id", householdId)
    .order("sort_order", { ascending: true });

  if (poolErr) {
    console.error("[savings] load pools failed", poolErr.message);
    throw poolErr;
  }

  const { data: individualGoals, error: g1Err } = await supabase
    .from("savings_goals")
    .select("*")
    .eq("scope", "individual")
    .eq("owner_user_id", userId)
    .order("sort_order", { ascending: true });

  if (g1Err) {
    console.error("[savings] load individual goals failed", g1Err.message);
    throw g1Err;
  }

  const { data: sharedGoals, error: g2Err } = await supabase
    .from("savings_goals")
    .select("*")
    .eq("scope", "shared")
    .eq("household_id", householdId)
    .order("sort_order", { ascending: true });

  if (g2Err) {
    console.error("[savings] load shared goals failed", g2Err.message);
    throw g2Err;
  }

  const accounts = (accountRows ?? []).map((r) => mapAccount(r));
  const pools = (poolRows ?? []).map((r) => mapPool(r));
  const goals = [...(individualGoals ?? []), ...(sharedGoals ?? [])].map((r) =>
    mapGoal(r)
  );
  const totals = buildSavingsSnapshot(accounts, pools, goals);

  console.info("[savings] bundle loaded", {
    userId,
    householdId,
    paired,
    accounts: accounts.length,
    pools: pools.length,
    goals: goals.length,
  });

  return {
    accounts,
    pools,
    goals,
    totals,
    householdId,
    paired,
  };
}
