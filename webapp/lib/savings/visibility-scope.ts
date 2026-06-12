import type { SupabaseClient } from "@supabase/supabase-js";

export type SavingsVisibilityScope = {
  accountIds: string[];
  poolIds: string[];
};

/** Personal cash accounts + household joint pools visible to this user (matches savings RLS). */
export async function loadSavingsVisibilityScope(
  supabase: SupabaseClient,
  userId: string
): Promise<SavingsVisibilityScope> {
  const { data: accounts, error: acctErr } = await supabase
    .from("user_savings_accounts")
    .select("id")
    .eq("user_id", userId);
  if (acctErr) throw new Error(acctErr.message);

  const { data: membership, error: memErr } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (memErr) throw new Error(memErr.message);

  let poolIds: string[] = [];
  if (membership?.household_id) {
    const { data: pools, error: poolErr } = await supabase
      .from("savings_pools")
      .select("id")
      .eq("household_id", membership.household_id);
    if (poolErr) throw new Error(poolErr.message);
    poolIds = (pools ?? []).map((p) => String(p.id));
  }

  const scope = {
    accountIds: (accounts ?? []).map((a) => String(a.id)),
    poolIds,
  };

  console.info("[savings-scope] loaded visibility scope", {
    userId,
    accountCount: scope.accountIds.length,
    poolCount: scope.poolIds.length,
  });

  return scope;
}

export function savingsScopeOrFilter(scope: SavingsVisibilityScope): string | null {
  const parts: string[] = [];
  if (scope.accountIds.length) {
    parts.push(`account_id.in.(${scope.accountIds.join(",")})`);
  }
  if (scope.poolIds.length) {
    parts.push(`pool_id.in.(${scope.poolIds.join(",")})`);
  }
  return parts.length ? parts.join(",") : null;
}

export function accountIdInSavingsScope(
  scope: SavingsVisibilityScope,
  accountId: string
): boolean {
  return scope.accountIds.includes(accountId);
}

export function poolIdInSavingsScope(scope: SavingsVisibilityScope, poolId: string): boolean {
  return scope.poolIds.includes(poolId);
}
