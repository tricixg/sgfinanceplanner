import { describe, expect, it } from "vitest";
import { isSupersededStatement, latestClosedOf } from "./latest";

const rows = [
  { statementCloseDate: "2026-09-05" },
  { statementCloseDate: "2026-10-05" },
  { statementCloseDate: "2026-11-05" },
  { statementCloseDate: "2026-12-05" }, // still open
];

describe("latest closed statement", () => {
  it("picks the newest closed statement", () => {
    expect(latestClosedOf(rows, "2026-11-17")?.statementCloseDate).toBe("2026-11-05");
  });

  it("marks older statements superseded, not the latest", () => {
    expect(isSupersededStatement(rows, "2026-11-17", "2026-10-05")).toBe(true);
    expect(isSupersededStatement(rows, "2026-11-17", "2026-11-05")).toBe(false);
  });
});
