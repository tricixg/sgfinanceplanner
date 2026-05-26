import { describe, expect, it } from "vitest";
import {
  isIsoDate,
  parseDateRangeFilter,
  savingsOccurredAtLowerBound,
  savingsOccurredAtUpperBoundExclusive,
} from "@/lib/transactions/date-range";

describe("parseDateRangeFilter", () => {
  it("accepts empty range", () => {
    expect(parseDateRangeFilter()).toEqual({});
    expect(parseDateRangeFilter("", "")).toEqual({});
  });

  it("accepts from-only and to-only", () => {
    expect(parseDateRangeFilter("2025-01-01", "")).toEqual({ dateFrom: "2025-01-01" });
    expect(parseDateRangeFilter("", "2025-12-31")).toEqual({ dateTo: "2025-12-31" });
  });

  it("rejects invalid and inverted ranges", () => {
    expect(parseDateRangeFilter("2025-13-01")).toEqual({
      error: "dateFrom must be YYYY-MM-DD",
    });
    expect(parseDateRangeFilter("2025-06-10", "2025-06-01")).toEqual({
      error: "dateFrom must be on or before dateTo",
    });
  });
});

describe("savings occurred_at bounds", () => {
  it("maps inclusive calendar days to timestamptz bounds", () => {
    expect(isIsoDate("2025-05-10")).toBe(true);
    expect(savingsOccurredAtLowerBound("2025-05-10")).toBe("2025-05-10T00:00:00.000Z");
    expect(savingsOccurredAtUpperBoundExclusive("2025-05-10")).toBe(
      "2025-05-11T00:00:00.000Z"
    );
  });
});
