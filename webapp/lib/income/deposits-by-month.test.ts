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

  it("ignores non-positive rows (e.g. negative adjustments)", () => {
    const result = { "2026-05": 0 };
    addAdditiveRowsToMonths(result, [
      { occurred_at: "2026-05-01T00:00:00Z", amount: -30 },
      { occurred_at: "2026-05-02T00:00:00Z", amount: 0 },
      { occurred_at: "2026-05-03T00:00:00Z", amount: 45 },
    ]);
    expect(result["2026-05"]).toBe(45);
  });

  it("ignores reimbursement-linked deposits when excludeReimbursements is set (additive bucket)", () => {
    const result = { "2026-05": 0 };
    addAdditiveRowsToMonths(
      result,
      [
        {
          occurred_at: "2026-05-01T00:00:00Z",
          amount: 500,
          source_record_id: "expense-123",
        },
        { occurred_at: "2026-05-02T00:00:00Z", amount: 80, source_record_id: null },
      ],
      true
    );
    expect(result["2026-05"]).toBe(80);
  });

  it("counts reimbursement-linked deposits by default (baseline bucket)", () => {
    const result = { "2026-05": 0 };
    addAdditiveRowsToMonths(result, [
      {
        occurred_at: "2026-05-01T00:00:00Z",
        amount: 500,
        source_record_id: "expense-123",
      },
      { occurred_at: "2026-05-02T00:00:00Z", amount: 80, source_record_id: null },
    ]);
    expect(result["2026-05"]).toBe(580);
  });
});
