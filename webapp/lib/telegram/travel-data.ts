import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureTravelBudgetLine } from "@/lib/travel/budget-line";
import {
  listTravelExpensesInRange,
  listTripBudgets,
  listTripsForYear,
} from "@/lib/travel/load";
import { buildTravelTripSummaries } from "@/lib/travel/summary";
import type { TravelTripSummary } from "@/lib/travel/types";

export async function loadTravelTripsForYear(
  supabase: SupabaseClient,
  userId: string,
  year: number
): Promise<TravelTripSummary[]> {
  await ensureTravelBudgetLine(supabase, userId);
  const trips = await listTripsForYear(supabase, userId, year);
  const tripIds = trips.map((t) => t.id);
  const { data: budgetRows, error: budgetErr } = await supabase
    .from("travel_trip_budgets")
    .select("*")
    .eq("user_id", userId)
    .in("trip_id", tripIds.length ? tripIds : ["00000000-0000-0000-0000-000000000000"]);

  if (budgetErr) throw new Error(budgetErr.message);

  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const expenses = await listTravelExpensesInRange(supabase, userId, from, to);
  const budgets = (budgetRows ?? []).map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    tripId: String(r.trip_id),
    subCategory: String(r.sub_category ?? ""),
    budgetAmount: Number(r.budget_amount ?? 0),
    sortOrder: Number(r.sort_order ?? 0),
  }));

  return buildTravelTripSummaries(trips, budgets, expenses);
}

export { listTripBudgets };
