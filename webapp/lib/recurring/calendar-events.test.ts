import { describe, expect, it } from "vitest";
import { getRecurringCalendarEvents } from "@/lib/recurring/calendar-events";
import type { DashboardState } from "@/lib/types";

const emptyState = {
  loans: [],
  insurancePolicies: [],
  ilpPolicies: [],
} as unknown as DashboardState;

describe("getRecurringCalendarEvents", () => {
  it("includes subscriptions with a deduction day", () => {
    const events = getRecurringCalendarEvents(emptyState, "2025-05", [
      { id: "s1", name: "Netflix", amount: 19.9, notes: "", deductionDay: 15 },
    ]);
    expect(events).toEqual([
      {
        day: 15,
        type: "recurring",
        label: "Netflix — subscription",
        amount: 19.9,
      },
    ]);
  });

  it("skips subscriptions without amount or due day", () => {
    const events = getRecurringCalendarEvents(emptyState, "2025-05", [
      { name: "No day", amount: 10, notes: "" },
      { name: "Zero", amount: 0, notes: "", deductionDay: 5 },
    ]);
    expect(events).toHaveLength(0);
  });
});
