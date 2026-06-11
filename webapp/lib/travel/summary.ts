import type { Expense } from "@/lib/savings/types";
import { parseTripSubCategoryFromNote, TRAVEL_CATEGORY } from "@/lib/travel/notes";
import { myShareFromSplit } from "@/lib/travel/split";
import type {
  TravelExpenseSplit,
  TravelTrip,
  TravelTripBudget,
  TravelTripSummary,
} from "@/lib/travel/types";

export function travelSpentForTrip(
  trip: TravelTrip,
  expenses: Expense[],
  splitsByExpenseId?: Map<string, TravelExpenseSplit | null>
): number {
  return expenses
    .filter(
      (e) =>
        e.category === TRAVEL_CATEGORY &&
        parseTripSubCategoryFromNote(trip.name, e.note) != null
    )
    .reduce((sum, e) => {
      const split = splitsByExpenseId?.get(e.id) ?? null;
      return sum + myShareFromSplit(split, Number(e.amount ?? 0));
    }, 0);
}

export function buildTravelTripSummaries(
  trips: TravelTrip[],
  budgets: TravelTripBudget[],
  expenses: Expense[],
  splitsByExpenseId?: Map<string, TravelExpenseSplit | null>
): TravelTripSummary[] {
  return trips.map((trip) => {
    const budgeted = budgets
      .filter((b) => b.tripId === trip.id)
      .reduce((sum, b) => sum + Number(b.budgetAmount ?? 0), 0);
    const spent = travelSpentForTrip(trip, expenses, splitsByExpenseId);
    return { ...trip, budgeted, spent };
  });
}
