import type { RecurringSubscription } from "@/lib/types";

export const COMPUTED_SUBSCRIPTION_LABEL = "Subscriptions & recurring";

export function computedSubscriptionMonthly(subscriptions: RecurringSubscription[]): number {
  return subscriptions.reduce((s, sub) => s + sub.amount, 0);
}

export function defaultRecurringSubscription(): RecurringSubscription {
  return { name: "", amount: 0, notes: "" };
}
