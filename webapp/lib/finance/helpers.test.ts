import { describe, expect, it } from "vitest";
import { effectiveCalendarDay, fmtSigned2 } from "@/lib/finance/helpers";

describe("effectiveCalendarDay", () => {
  it("clamps day 31 to the last day of shorter months", () => {
    expect(effectiveCalendarDay(31, "2026-02")).toBe(28);
    expect(effectiveCalendarDay(31, "2026-04")).toBe(30);
    expect(effectiveCalendarDay(31, "2026-01")).toBe(31);
  });

  it("clamps day 31 to 29 in leap-year February", () => {
    expect(effectiveCalendarDay(31, "2024-02")).toBe(29);
  });
});

describe("fmtSigned2", () => {
  it("prefixes sign before dollar for positive amounts", () => {
    expect(fmtSigned2(100)).toBe("+$100.00");
  });

  it("prefixes sign before dollar for negative amounts", () => {
    expect(fmtSigned2(-94.9)).toBe("-$94.90");
  });

  it("formats zero without sign", () => {
    expect(fmtSigned2(0)).toBe("$0.00");
  });
});
