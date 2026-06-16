import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSavingsSnapshot } from "@/lib/finance/savings-totals";
import { ensureUserHousehold } from "@/lib/household/bootstrap";
import type { SavingsBundle, SavingsSnapshot, UserSavingsAccount } from "@/lib/savings/types";
import { mapGoal, mapPool } from "@/lib/savings/db-mappers";

/**
 * Pools + goals; personal account rows come from loadAccountsBundle.
 * `accounts` only feeds `totals` via buildSavingsSnapshot — pass `[]` when loading
 * in parallel with loadAccountsBundle and merge with mergeSavingsSnapshots afterward.
 */
export async function loadSavingsBundle(
  supabase: SupabaseClient,
  userId: string,
  accounts: UserSavingsAccount[] = []
): Promise<SavingsBundle> {
  const householdId = await ensureUserHousehold(supabase, userId);

  const { data: members } = await supabase
    .from("household_members")
    .select("user_id")
    .eq("household_id", householdId);

  const paired = (members?.length ?? 0) > 1;
  const memberList = (members ?? []).map((m) => ({ userId: String(m.user_id) }));

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

  const pools = (poolRows ?? []).map((r) => mapPool(r));
  const goals = [...(individualGoals ?? []), ...(sharedGoals ?? [])].map((r) =>
    mapGoal(r)
  );
  const totals = buildSavingsSnapshot(accounts, pools, goals);

  console.info("[savings] bundle loaded", {
    userId,
    householdId,
    paired,
    pools: pools.length,
    goals: goals.length,
  });

  return {
    pools,
    goals,
    totals,
    householdId,
    paired,
    myUserId: userId,
    members: memberList,
  };
}

export function mergeSavingsSnapshots(
  accountTotals: Pick<SavingsSnapshot, "personalSavingsCash" | "personalNetWorthCash">,
  savingsBundle: SavingsBundle
): SavingsSnapshot {
  return {
    ...savingsBundle.totals,
    personalSavingsCash: accountTotals.personalSavingsCash,
    personalNetWorthCash: accountTotals.personalNetWorthCash,
    personalCash: accountTotals.personalSavingsCash,
  };
}
