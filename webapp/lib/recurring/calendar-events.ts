import type { CalendarEvent } from "@/lib/finance/calendar";
import { clampDay } from "@/lib/finance/helpers";
import { isLoanActiveInMonth } from "@/lib/recurring/status";
import type { DashboardState, RecurringSubscription } from "@/lib/types";

export function getRecurringCalendarEvents(
  S: DashboardState,
  viewYm: string,
  subscriptions: RecurringSubscription[] = []
): CalendarEvent[] {
  const [y, m] = viewYm.split("-").map(Number);
  const month = m - 1;
  const events: CalendarEvent[] = [];

  const push = (
    day: number | undefined,
    label: string,
    amount: number
  ) => {
    if (!day || day < 1 || day > 31 || amount <= 0) return;
    events.push({
      day: clampDay(y, month, day),
      type: "recurring",
      label,
      amount,
    });
  };

  for (const loan of S.loans) {
    if (!isLoanActiveInMonth(loan.end, viewYm) || loan.monthly <= 0) continue;
    push(loan.deductionDay, `${loan.name || "Loan"} — instalment`, loan.monthly);
  }

  for (const p of S.insurancePolicies) {
    if (p.monthlyPremium <= 0) continue;
    const label = p.name || p.insurer || "Insurance";
    push(p.deductionDay, `${label} — premium`, p.monthlyPremium);
  }

  for (const p of S.ilpPolicies) {
    if (p.monthlyPremium <= 0) continue;
    const label = [p.insurer, p.planName].filter(Boolean).join(" ") || "ILP";
    push(p.deductionDay, `${label} — premium`, p.monthlyPremium);
  }

  for (const s of subscriptions) {
    push(s.deductionDay, `${s.name || "Subscription"}`, s.amount);
  }

  console.log("[getRecurringCalendarEvents]", viewYm, events.length);
  return events;
}
