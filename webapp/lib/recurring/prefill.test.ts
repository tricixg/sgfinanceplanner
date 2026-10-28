import { describe, expect, it } from "vitest";
import {
  defaultRecurringNote,
  formatDeductionDayLabel,
  prefillSpentAt,
} from "@/lib/recurring/prefill";
import { sgtTodayYmd } from "@/lib/time/sgt";

describe("prefillSpentAt", () => {
  it("builds date for month and day", () => {
    expect(prefillSpentAt("2025-05", 15)).toBe("2025-05-15");
  });

  it("clamps day 31 to last day of April", () => {
    expect(prefillSpentAt("2025-04", 31)).toBe("2025-04-30");
  });

  it("falls back to today when no deduction day", () => {
    expect(prefillSpentAt("2025-05", null)).toBe(sgtTodayYmd());
  });
});

describe("formatDeductionDayLabel", () => {
  it("formats ordinals", () => {
    expect(formatDeductionDayLabel(1)).toBe("1st");
    expect(formatDeductionDayLabel(15)).toBe("15th");
  });
});

describe("defaultRecurringNote", () => {
  it("uses item name and month paid", () => {
    expect(defaultRecurringNote("Netflix", "2026-10-05")).toBe("Netflix · Oct 26");
  });

  it("falls back to the name without a valid date", () => {
    expect(defaultRecurringNote("Netflix", "")).toBe("Netflix");
  });
});
