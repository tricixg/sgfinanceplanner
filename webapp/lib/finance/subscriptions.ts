import type { RecurringInvestment, RecurringSubscription } from "@/lib/types";

export const COMPUTED_SUBSCRIPTION_LABEL = "Other Recurring";

export function computedSubscriptionMonthly(subscriptions: RecurringSubscription[]): number {
  return subscriptions.reduce((s, sub) => s + sub.amount, 0);
}

export function defaultRecurringSubscription(): RecurringSubscription {
  return { name: "", amount: 0, notes: "" };
}

export function defaultRecurringInvestment(fundId = ""): RecurringInvestment {
  return { name: "", amount: 0, notes: "", fundId };
}

type FloorableRecurringItem = { budgetLineId?: string; amount: number; endMonth?: string };

/** Budget category floors from linked, active recurring items (subscriptions and/or
 *  recurring investments) — a category's amount can never be saved below the sum of
 *  the items linked to it. */
export function recurringFloorsByBudgetLine(
  items: FloorableRecurringItem[],
  asOfYm: string
): Map<string, number> {
  const floors = new Map<string, number>();
  for (const s of items) {
    if (!s.budgetLineId) continue;
    if (s.endMonth && s.endMonth < asOfYm) continue;
    floors.set(s.budgetLineId, (floors.get(s.budgetLineId) ?? 0) + s.amount);
  }
  return floors;
}
