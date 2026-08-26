import { describe, expect, it } from "vitest";
import { reimbursementStatus } from "@/lib/transactions/reimburse-totals";

describe("reimbursementStatus", () => {
  it("returns none when nothing reimbursed", () => {
    expect(reimbursementStatus(100, 0)).toBe("none");
  });

  it("returns partial when some but not all reimbursed", () => {
    expect(reimbursementStatus(100, 40)).toBe("partial");
  });

  it("returns full when reimbursed equals the amount", () => {
    expect(reimbursementStatus(100, 100)).toBe("full");
  });

  it("treats floating-point rounding as full", () => {
    expect(reimbursementStatus(45, 15 + 15 + 15)).toBe("full");
  });

  it("returns full when reimbursed exceeds the amount", () => {
    expect(reimbursementStatus(50, 60)).toBe("full");
  });
});
