import { describe, expect, it } from "vitest";
import { resolveAmountForClose } from "@/lib/credit-cards/card-statements/calendar-amounts";

describe("resolveAmountForClose", () => {
  it("matches exact close date", () => {
    const map = new Map([["2026-04-05", 1200]]);
    expect(resolveAmountForClose(map, "2026-04-05")).toBe(1200);
  });

  it("falls back to same-month close when projected day differs", () => {
    const map = new Map([["2026-04-06", 900]]);
    expect(resolveAmountForClose(map, "2026-04-05")).toBe(900);
  });
});
