import { describe, expect, it } from "vitest";
import {
  cycleBoundsFromClose,
  openCycleBounds,
  paymentDueDate,
  statementCloseForSpend,
} from "./statement-cycle";

describe("statement-cycle", () => {
  it("May 21 statement covers Apr 22 – May 21 (cycle starts day after statement day)", () => {
    const { cycleStart, cycleEnd } = cycleBoundsFromClose("2026-05-21", 21);
    expect(cycleStart).toBe("2026-04-22");
    expect(cycleEnd).toBe("2026-05-21");
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
});
