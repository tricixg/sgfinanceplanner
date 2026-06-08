import { describe, expect, it } from "vitest";
import {
  compareSgtSortAtDescending,
  isoInstantToSgtSortAt,
  sgtNowInputDateTime,
  sgtNowTimeHms,
  sgtSpentAtToIso,
  sgtTodayYmd,
  sgtYmdDaysAgo,
} from "@/lib/time/sgt";

describe("SGT time helpers", () => {
  it("formats SGT date and datetime-local values", () => {
    const utc = new Date("2026-05-28T16:30:00.000Z"); // 2026-05-29 00:30 in SGT
    expect(sgtTodayYmd(utc)).toBe("2026-05-29");
    expect(sgtNowInputDateTime(utc)).toBe("2026-05-29T00:30");
  });

  it("computes SGT days-ago date", () => {
    const utc = new Date("2026-05-28T16:30:00.000Z"); // 2026-05-29 in SGT
    expect(sgtYmdDaysAgo(29, utc)).toBe("2026-04-30");
  });

  it("returns SGT wall-clock time of day", () => {
    const utc = new Date("2026-05-28T16:30:45.000Z"); // 2026-05-29 00:30:45 SGT
    expect(sgtNowTimeHms(utc)).toBe("00:30:45");
  });

  it("builds ISO from SGT spent date and time", () => {
    expect(sgtSpentAtToIso("2026-05-29", "00:30")).toBe("2026-05-29T00:30:00+08:00");
  });

  it("normalizes UTC ledger occurred_at to SGT sort key", () => {
    expect(isoInstantToSgtSortAt("2025-06-01T15:58:51.679Z")).toBe(
      "2025-06-01T23:58:51+08:00"
    );
  });

  it("sorts reimbursement after expense on the same SGT day", () => {
    const expense = "2025-06-01T20:00:00+08:00";
    const reimbursement = isoInstantToSgtSortAt("2025-06-01T15:58:51.679Z");
    expect(compareSgtSortAtDescending(reimbursement, expense)).toBeLessThan(0);
    expect(compareSgtSortAtDescending(expense, reimbursement)).toBeGreaterThan(0);
  });
});

