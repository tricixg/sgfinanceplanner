import type { Expense } from "@/lib/savings/types";
import { parseTripSubCategoryFromNote, TRAVEL_CATEGORY } from "@/lib/travel/notes";
import type { TravelTrip, TravelTripBudget, TravelTripSummary } from "@/lib/travel/types";

export function travelSpentForTrip(trip: TravelTrip, expenses: Expense[]): number {
  return expenses
    .filter(
      (e) =>
        e.category === TRAVEL_CATEGORY &&
        parseTripSubCategoryFromNote(trip.name, e.note) != null
    )
    .reduce((sum, e) => sum + Number(e.amount ?? 0), 0);
}

export function buildTravelTripSummaries(
  trips: TravelTrip[],
  budgets: TravelTripBudget[],
  expenses: Expense[]
): TravelTripSummary[] {
  return trips.map((trip) => {
    const budgeted = budgets
      .filter((b) => b.tripId === trip.id)
      .reduce((sum, b) => sum + Number(b.budgetAmount ?? 0), 0);
    const spent = travelSpentForTrip(trip, expenses);
    return { ...trip, budgeted, spent };
  });
}
