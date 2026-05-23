import type { SupabaseClient } from "@supabase/supabase-js";
import type { DashboardState } from "@/lib/types";
import { migrateBudgetFromDashboard } from "@/lib/budget/load";
import { migrateCreditCardsFromDashboard } from "@/lib/credit-cards/migrate-from-dashboard";
import { migrateHoldingsFromDashboard } from "@/lib/holdings/load";
import { migrateLoansFromDashboard } from "@/lib/loans/load";
import { migrateProfileFromDashboard } from "@/lib/profile/load";
import { needsSavingsMigration, migrateSavingsFromDashboardJson } from "@/lib/savings/migrate-from-dashboard";

export async function migrateAllDomainsFromDashboard(
  supabase: SupabaseClient,
  userId: string,
  state: DashboardState,
  raw: unknown
): Promise<DashboardState> {
  let next = state;

  if (needsSavingsMigration(raw)) {
    next = await migrateSavingsFromDashboardJson(supabase, userId, next);
  }

  await migrateCreditCardsFromDashboard(supabase, userId, next);
  await migrateLoansFromDashboard(supabase, userId, next.loans ?? []);
  await migrateBudgetFromDashboard(supabase, userId, next.budget ?? []);
  await migrateHoldingsFromDashboard(
    supabase,
    userId,
    next.holdings ?? [],
    next.portfolioHistory ?? []
  );
  await migrateProfileFromDashboard(supabase, userId, next);

  return {
    ...next,
    creditCards: [],
    loans: [],
    budget: [],
    holdings: [],
    portfolioHistory: [],
    insurancePolicies: [],
    ilpPolicies: [],
    accounts: [],
    goals: [],
    _migrated_v2: true,
  } as DashboardState & { _migrated_v2?: boolean };
}
