import { describe, expect, it } from "vitest";
import { addAdditiveRowsToMonths } from "@/lib/income/deposits-by-month";

describe("addAdditiveRowsToMonths", () => {
  it("adds deposits into months initialized at zero", () => {
    const result = {
      "2026-05": 0,
      "2026-06": 0,
    };
    addAdditiveRowsToMonths(result, [
      { occurred_at: "2026-05-15T10:00:00Z", amount: 120 },
      { occurred_at: "2026-06-02T08:30:00Z", amount: 80 },
    ]);
    expect(result).toEqual({
      "2026-05": 120,
      "2026-06": 80,
    });
  });
});
