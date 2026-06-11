import { describe, expect, it } from "vitest";
import { pokerImportProgressPercent } from "@/lib/poker/import-sessions";

describe("pokerImportProgressPercent", () => {
  it("maps resolving phase to 0–50%", () => {
    expect(pokerImportProgressPercent({ current: 0, total: 10, phase: "resolving" })).toBe(0);
    expect(pokerImportProgressPercent({ current: 5, total: 10, phase: "resolving" })).toBe(25);
    expect(pokerImportProgressPercent({ current: 10, total: 10, phase: "resolving" })).toBe(50);
  });

  it("maps importing phase to 50–100%", () => {
    expect(pokerImportProgressPercent({ current: 0, total: 10, phase: "importing" })).toBe(50);
    expect(pokerImportProgressPercent({ current: 5, total: 10, phase: "importing" })).toBe(75);
    expect(pokerImportProgressPercent({ current: 10, total: 10, phase: "importing" })).toBe(100);
  });
});
