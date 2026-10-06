import { describe, expect, it } from "vitest";
import { currentCycleWindow } from "@/lib/benefits/cycle";

describe("currentCycleWindow", () => {
  it("never resets a one-time benefit (cycleMonths null)", () => {
    expect(currentCycleWindow("2024-01-01", null, "2026-10-06")).toEqual({
      start: "2024-01-01",
      end: null,
    });
  });

  it("stays in the first annual cycle before it elapses", () => {
    expect(currentCycleWindow("2026-01-01", 12, "2026-06-15")).toEqual({
      start: "2026-01-01",
      end: "2027-01-01",
    });
  });

  it("rolls an annual cycle forward past its anniversary", () => {
    expect(currentCycleWindow("2024-01-01", 12, "2026-10-06")).toEqual({
      start: "2026-01-01",
      end: "2027-01-01",
    });
  });

  it("lands exactly on the boundary date in the new cycle", () => {
    expect(currentCycleWindow("2024-01-01", 12, "2026-01-01")).toEqual({
      start: "2026-01-01",
      end: "2027-01-01",
    });
  });

  it("supports multi-year cycles (e.g. every 2 years)", () => {
    expect(currentCycleWindow("2023-06-01", 24, "2026-10-06")).toEqual({
      start: "2025-06-01",
      end: "2027-06-01",
    });
  });

  it("supports monthly cycles (e.g. Communication allowance)", () => {
    expect(currentCycleWindow("2026-01-15", 1, "2026-10-06")).toEqual({
      start: "2026-09-15",
      end: "2026-10-15",
    });
  });

  it("supports sub-annual cycles (e.g. quarterly)", () => {
    expect(currentCycleWindow("2026-01-01", 3, "2026-10-06")).toEqual({
      start: "2026-10-01",
      end: "2027-01-01",
    });
  });

  it("handles an anchor still in the future", () => {
    expect(currentCycleWindow("2027-01-01", 12, "2026-10-06")).toEqual({
      start: "2027-01-01",
      end: "2028-01-01",
    });
  });
});
