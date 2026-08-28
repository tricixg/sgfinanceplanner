import { describe, expect, it } from "vitest";
import {
  activeStatementBatchMonth,
  cycleBoundsFromClose,
  earliestStatementDay,
  isStatementClosed,
  openCycleBounds,
  paymentDueDate,
  recentStatementCloseDates,
  statementCloseForSpend,
  statementBatchMonthLabel,
  targetStatementCloseForBatch,
} from "./statement-cycle";

describe("statement-cycle", () => {
  it("May 21 statement covers Apr 22 – May 21 (cycle starts day after statement day)", () => {
    const { cycleStart, cycleEnd } = cycleBoundsFromClose("2026-05-21", 21);
    expect(cycleStart).toBe("2026-04-22");
    expect(cycleEnd).toBe("2026-05-21");
  });

  it("statement day 31: Feb close cycle starts Jan 29, not Jan 29 through the prior cycle's Jan 31 (no overlap)", () => {
    // Jan close (statementDay 31): cycle is [Jan 1, Jan 31]
    const jan = cycleBoundsFromClose("2026-01-31", 31);
    expect(jan.cycleStart).toBe("2026-01-01");
    expect(jan.cycleEnd).toBe("2026-01-31");

    // Feb close clamps to Feb 28 (2026 is not a leap year), but the cycle must
    // start the day after the *true* Jan 31 close, not Jan 28.
    const feb = cycleBoundsFromClose("2026-02-28", 31);
    expect(feb.cycleStart).toBe("2026-02-01");
    expect(feb.cycleEnd).toBe("2026-02-28");

    // Jan 29, 30, 31 must not fall inside both cycles.
    expect(jan.cycleEnd >= "2026-01-29").toBe(true);
    expect(feb.cycleStart > jan.cycleEnd).toBe(true);
  });

  it("statement day 31: Apr close (30-day month) doesn't overlap Mar's cycle", () => {
    const mar = cycleBoundsFromClose("2026-03-31", 31);
    expect(mar.cycleStart).toBe("2026-03-01");
    expect(mar.cycleEnd).toBe("2026-03-31");

    const apr = cycleBoundsFromClose("2026-04-30", 31);
    expect(apr.cycleStart).toBe("2026-04-01");
    expect(apr.cycleEnd).toBe("2026-04-30");

    expect(apr.cycleStart > mar.cycleEnd).toBe(true);
  });

  it("recentStatementCloseDates for day 31 doesn't permanently degrade after crossing a short month", () => {
    const closes = recentStatementCloseDates(31, 6, "2026-04-15");
    // Newest first: Mar 31 (open cycle as of Apr 15), Feb 28, Jan 31, Dec 31, Nov 30, Oct 31
    expect(closes).toEqual([
      "2026-03-31",
      "2026-02-28",
      "2026-01-31",
      "2025-12-31",
      "2025-11-30",
      "2025-10-31",
    ]);
  });

  it("payment due is in month after statement close", () => {
    expect(paymentDueDate("2026-05-21", 10)).toBe("2026-06-10");
  });

  it("assigns spend on cycle end to that statement", () => {
    expect(statementCloseForSpend("2026-05-20", 21)).toBe("2026-05-21");
    expect(statementCloseForSpend("2026-05-21", 21)).toBe("2026-05-21");
  });

  it("assigns spend on day after cycle end to next statement", () => {
    expect(statementCloseForSpend("2026-05-22", 21)).toBe("2026-06-21");
  });

  it("open cycle before statement day in May", () => {
    const { cycleStart, cycleEnd, statementClose } = openCycleBounds(21, "2026-05-15");
    expect(cycleStart).toBe("2026-04-22");
    expect(cycleEnd).toBe("2026-05-21");
    expect(statementClose).toBe("2026-05-21");
  });

  it("open cycle after statement day in May", () => {
    const { cycleStart, cycleEnd, statementClose } = openCycleBounds(21, "2026-05-25");
    expect(cycleStart).toBe("2026-05-22");
    expect(cycleEnd).toBe("2026-06-21");
    expect(statementClose).toBe("2026-06-21");
  });

  it("statement is closed on its statement close date", () => {
    expect(isStatementClosed("2026-06-12", "2026-06-12")).toBe(true);
    expect(isStatementClosed("2026-06-12", "2026-06-11")).toBe(false);
    expect(isStatementClosed("2026-06-12", "2026-06-13")).toBe(true);
  });

  it("unlocks statement batch on earliest card day for all cards", () => {
    const earliest = earliestStatementDay([12, 21]);
    expect(earliest).toBe(12);

    expect(activeStatementBatchMonth("2026-06-11", earliest)).toEqual({
      year: 2026,
      monthIndex: 4,
    });
    expect(targetStatementCloseForBatch(12, "2026-06-11", earliest)).toBe(
      "2026-05-12"
    );
    expect(targetStatementCloseForBatch(21, "2026-06-11", earliest)).toBe(
      "2026-05-21"
    );

    expect(activeStatementBatchMonth("2026-06-12", earliest)).toEqual({
      year: 2026,
      monthIndex: 5,
    });
    expect(targetStatementCloseForBatch(12, "2026-06-12", earliest)).toBe(
      "2026-06-12"
    );
    expect(targetStatementCloseForBatch(21, "2026-06-12", earliest)).toBe(
      "2026-06-21"
    );

    expect(targetStatementCloseForBatch(21, "2026-06-20", earliest)).toBe(
      "2026-06-21"
    );
    expect(targetStatementCloseForBatch(12, "2026-07-05", earliest)).toBe(
      "2026-06-12"
    );
    expect(targetStatementCloseForBatch(21, "2026-07-05", earliest)).toBe(
      "2026-06-21"
    );
    expect(targetStatementCloseForBatch(12, "2026-07-12", earliest)).toBe(
      "2026-07-12"
    );

    expect(statementBatchMonthLabel("2026-06-12", earliest)).toBe("June 2026");
    expect(statementBatchMonthLabel("2026-06-11", earliest)).toBe("May 2026");
    expect(statementBatchMonthLabel("2026-06-12", earliest, 1)).toBe("May 2026");
  });
});
