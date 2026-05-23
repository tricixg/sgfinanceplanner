import { describe, expect, it } from "vitest";
import { formatDeductionDayLabel, prefillSpentAt } from "@/lib/recurring/prefill";

describe("prefillSpentAt", () => {
  it("builds date for month and day", () => {
    expect(prefillSpentAt("2025-05", 15)).toBe("2025-05-15");
  });

  it("clamps day 31 to last day of April", () => {
    expect(prefillSpentAt("2025-04", 31)).toBe("2025-04-30");
  });

  it("falls back to today when no deduction day", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(prefillSpentAt("2025-05", null)).toBe(today);
  });
});

describe("formatDeductionDayLabel", () => {
  it("formats ordinals", () => {
    expect(formatDeductionDayLabel(1)).toBe("1st");
    expect(formatDeductionDayLabel(15)).toBe("15th");
  });
});
