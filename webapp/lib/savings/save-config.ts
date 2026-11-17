import type { SupabaseClient } from "@supabase/supabase-js";
import type { SavingsGoal, SavingsPool } from "@/lib/savings/types";

import { SaveError, cleanIdList, isPersistedId } from "@/lib/sync/save-error";

export { SaveError as SaveConfigError };
const persistedIds = (ids: unknown) => cleanIdList(ids);

/**
 * Save the pool *configuration* (name / notes / flags / order) in place.
 *
 * - rows with a persisted id are UPDATED, never deleted and re-inserted, so the
 *   pool's ledger (savings_transactions.pool_id ON DELETE CASCADE) survives;
 * - rows without a persisted id are INSERTED;
 * - rows are only deleted when listed in `deletedIds`, and never while they
 *   still have ledger transactions;
 * - `balance` is ledger-derived and is never written from the edit form.
 */
export async function savePoolsConfig(
  supabase: SupabaseClient,
  householdId: string,
  pools: Partial<SavingsPool>[],
  deletedIds: unknown
): Promise<void> {
  const now = new Date().toISOString();
  const inserts: Record<string, unknown>[] = [];

  for (let i = 0; i < pools.length; i++) {
    const p = pools[i];
    const config = {
      name: p.name ?? "",
      notes: p.notes ?? "",
      include_in_savings: p.includeInSavings !== false,
      sort_order: p.sortOrder ?? i,
      updated_at: now,
    };
    if (isPersistedId(p.id)) {
      const { data, error } = await supabase
        .from("savings_pools")
        .update(config)
        .eq("id", p.id)
        .eq("household_id", householdId)
        .select("id");
      if (error) throw new SaveError(error.message, 500);
      if (!data || data.length === 0) {
        throw new SaveError(
          "A pool in this list no longer exists. Reload and try again.",
          409
        );
      }
    } else {
      inserts.push({ household_id: householdId, balance: 0, ...config });
    }
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from("savings_pools").insert(inserts);
    if (error) throw new SaveError(error.message, 500);
  }

  const toDelete = persistedIds(deletedIds);
  if (toDelete.length > 0) {
    const { data: used, error: usedErr } = await supabase
      .from("savings_transactions")
      .select("pool_id")
      .in("pool_id", toDelete);
    if (usedErr) throw new SaveError(usedErr.message, 500);
    if (used && used.length > 0) {
      throw new SaveError(
        "A pool with transaction history can't be removed — its ledger would be deleted.",
        409
      );
    }
    const { error } = await supabase
      .from("savings_pools")
      .delete()
      .in("id", toDelete)
      .eq("household_id", householdId);
    if (error) throw new SaveError(error.message, 500);
  }
}

function goalConfig(g: Partial<SavingsGoal>, i: number, now: string) {
  return {
    name: g.name ?? "",
    target_amount: g.targetAmount ?? 0,
    start_date: g.startDate ?? null,
    target_date: g.targetDate ?? null,
    monthly_contribution: g.monthlyContribution ?? 0,
    splits: g.splits ?? null,
    where_label: g.whereLabel ?? "",
    linked_account_id: isPersistedId(g.linkedAccountId) ? g.linkedAccountId : null,
    linked_pool_id: isPersistedId(g.linkedPoolId) ? g.linkedPoolId : null,
    linked_fund_id: isPersistedId(g.linkedFundId) ? g.linkedFundId : null,
    sort_order: g.sortOrder ?? i,
    updated_at: now,
  };
}

/**
 * Save goal configuration in place (same rules as {@link savePoolsConfig}).
 * `saved_amount` is ledger-derived and is never written from the edit form;
 * scope / owner of an existing goal never change.
 */
export async function saveGoalsConfig(
  supabase: SupabaseClient,
  userId: string,
  householdId: string,
  goals: Partial<SavingsGoal>[],
  deletedIds: unknown
): Promise<void> {
  const now = new Date().toISOString();
  const inserts: Record<string, unknown>[] = [];

  for (let i = 0; i < goals.length; i++) {
    const g = goals[i];
    const config = goalConfig(g, i, now);
    if (isPersistedId(g.id)) {
      const q = supabase.from("savings_goals").update(config).eq("id", g.id);
      const scoped =
        g.scope === "shared"
          ? q.eq("scope", "shared").eq("household_id", householdId)
          : q.eq("scope", "individual").eq("owner_user_id", userId);
      const { data, error } = await scoped.select("id");
      if (error) throw new SaveError(error.message, 500);
      if (!data || data.length === 0) {
        throw new SaveError(
          "A goal in this list no longer exists. Reload and try again.",
          409
        );
      }
    } else {
      const scope = g.scope === "shared" ? "shared" : "individual";
      inserts.push({
        scope,
        owner_user_id: scope === "individual" ? userId : null,
        household_id: scope === "shared" ? householdId : null,
        saved_amount: 0,
        ...config,
      });
    }
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from("savings_goals").insert(inserts);
    if (error) throw new SaveError(error.message, 500);
  }

  const toDelete = persistedIds(deletedIds);
  if (toDelete.length > 0) {
    const mine = await supabase
      .from("savings_goals")
      .delete()
      .in("id", toDelete)
      .eq("scope", "individual")
      .eq("owner_user_id", userId);
    if (mine.error) throw new SaveError(mine.error.message, 500);
    const shared = await supabase
      .from("savings_goals")
      .delete()
      .in("id", toDelete)
      .eq("scope", "shared")
      .eq("household_id", householdId);
    if (shared.error) throw new SaveError(shared.error.message, 500);
  }
}
