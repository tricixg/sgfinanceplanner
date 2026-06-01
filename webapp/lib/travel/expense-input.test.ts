import { describe, expect, it } from "vitest";
import {
  formatTravelSpentAtTable,
  parseTravelSpentAtInput,
  travelSpentAtToInput,
} from "@/lib/travel/expense-input";

describe("travel expense datetime", () => {
  it("parses datetime-local into date and time", () => {
    expect(parseTravelSpentAtInput("2026-06-01T14:30")).toEqual({
      spentAt: "2026-06-01",
      spentTime: "14:30:00",
    });
  });

  it("round-trips to datetime-local input", () => {
    expect(travelSpentAtToInput("2026-06-01", "14:30:00")).toBe("2026-06-01T14:30");
  });

  it("formats table date and time in SGT", () => {
    const { date, time } = formatTravelSpentAtTable("2026-06-01", "14:30:00");
    expect(date).toMatch(/2026/);
    expect(time).toMatch(/14:30/);
  });
});
