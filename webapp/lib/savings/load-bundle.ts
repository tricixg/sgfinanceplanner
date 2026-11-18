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
  // Individual goals only need the user id, so they load alongside the household lookup.
  // Members, pools and shared goals need the household id and load together once it is
  // known: two sequential round-trips instead of five.
  const individualGoalsQuery = supabase
    .from("savings_goals")
    .select("*")
    .eq("scope", "individual")
    .eq("owner_user_id", userId)
    .order("sort_order", { ascending: true });

  const [householdId, { data: individualGoals, error: g1Err }] = await Promise.all([
    ensureUserHousehold(supabase, userId),
    individualGoalsQuery,
  ]);

  const [{ data: members }, { data: poolRows, error: poolErr }, { data: sharedGoals, error: g2Err }] =
    await Promise.all([
      supabase.from("household_members").select("user_id").eq("household_id", householdId),
      supabase
        .from("savings_pools")
        .select("*")
        .eq("household_id", householdId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("savings_goals")
        .select("*")
        .eq("scope", "shared")
        .eq("household_id", householdId)
        .order("sort_order", { ascending: true }),
    ]);

  const paired = (members?.length ?? 0) > 1;
  const memberList = (members ?? []).map((m) => ({ userId: String(m.user_id) }));

  if (poolErr) {
    console.error("[savings] load pools failed", poolErr.message);
    throw poolErr;
  }
  if (g1Err) {
    console.error("[savings] load individual goals failed", g1Err.message);
    throw g1Err;
  }
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
  savingsBundle: SavingsBundle,
  fundsValue = 0
): SavingsSnapshot {
  return {
    ...savingsBundle.totals,
    personalSavingsCash: accountTotals.personalSavingsCash,
    personalNetWorthCash: accountTotals.personalNetWorthCash,
    personalCash: accountTotals.personalSavingsCash,
    personalFundsValue: fundsValue,
  };
}
