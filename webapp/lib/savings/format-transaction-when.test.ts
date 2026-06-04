import { describe, expect, it } from "vitest";
import {
  formatTransactionDate,
  formatTransactionTime,
} from "@/lib/savings/format-transaction-when";

describe("format-transaction-when", () => {
  it("formats UTC instant in Singapore time", () => {
    // 2026-05-28 16:30 UTC = 2026-05-29 00:30 SGT
    const iso = "2026-05-28T16:30:00.000Z";
    expect(formatTransactionDate(iso)).toBe("29/05/2026");
    expect(formatTransactionTime(iso)).toBe("00:30");
  });
});
