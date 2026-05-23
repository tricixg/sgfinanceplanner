import type { SupabaseClient } from "@supabase/supabase-js";
import type { DashboardState, Goal, SavingsAccount } from "@/lib/types";

type LegacyDashboardData = DashboardState & {
  _migrated_v1?: boolean;
};

export function needsSavingsMigration(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as LegacyDashboardData;
  if (d._migrated_v1) return false;
  const hasAccounts = Array.isArray(d.accounts) && d.accounts.length > 0;
  const hasGoals = Array.isArray(d.goals) && d.goals.length > 0;
  return hasAccounts || hasGoals;
}

export async function migrateSavingsFromDashboardJson(
  supabase: SupabaseClient,
  userId: string,
  data: LegacyDashboardData
): Promise<LegacyDashboardData> {
  const { count: acctCount } = await supabase
    .from("user_savings_accounts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if ((acctCount ?? 0) === 0 && (data.accounts?.length ?? 0) > 0) {
    const rows = (data.accounts ?? []).map((a: SavingsAccount, i: number) => ({
      user_id: userId,
      name: a.name ?? "",
      balance: a.balance ?? 0,
      notes: a.notes ?? "",
      sort_order: i,
    }));
    const { error } = await supabase.from("user_savings_accounts").insert(rows);
    if (error) {
      console.error("[migrate-v1] accounts insert failed", error.message);
    } else {
      console.info("[migrate-v1] migrated accounts", { count: rows.length, userId });
    }
  }

  const { count: goalCount } = await supabase
    .from("savings_goals")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", userId);

  if ((goalCount ?? 0) === 0 && (data.goals?.length ?? 0) > 0) {
    const rows = (data.goals ?? []).map((g: Goal, i: number) => ({
      scope: "individual",
      owner_user_id: userId,
      name: g.name ?? "",
      target_amount: g.target ?? 0,
      saved_amount: g.saved ?? 0,
      target_date: g.by?.length === 7 ? `${g.by}-01` : null,
      monthly_contribution: 0,
      where_label: g.where ?? "",
      sort_order: i,
    }));
    const { error } = await supabase.from("savings_goals").insert(rows);
    if (error) {
      console.error("[migrate-v1] goals insert failed", error.message);
    } else {
      console.info("[migrate-v1] migrated goals", { count: rows.length, userId });
    }
  }

  const budget = (data.budget ?? []).filter((b) => b.type !== "save");
  const cleaned: LegacyDashboardData = {
    ...data,
    accounts: [],
    goals: [],
    budget,
    _migrated_v1: true,
  };
  return cleaned;
}
