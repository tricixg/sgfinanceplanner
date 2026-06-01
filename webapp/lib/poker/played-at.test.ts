import { describe, expect, it } from "vitest";
import {
  formatPokerPlayedAtDisplay,
  parsePokerPlayedAtInput,
  pokerPlayedAtToInput,
  ymFromPokerPlayedAt,
} from "@/lib/poker/played-at";

describe("poker played-at", () => {
  it("parses datetime-local as SGT ISO", () => {
    expect(parsePokerPlayedAtInput("2026-05-20T14:30")).toBe("2026-05-20T14:30:00+08:00");
  });

  it("parses legacy date-only", () => {
    expect(parsePokerPlayedAtInput("2026-05-20")).toBe("2026-05-20T00:00:00+08:00");
  });

  it("converts stored ISO to datetime-local input", () => {
    expect(pokerPlayedAtToInput("2026-05-20T14:30:00+08:00")).toBe("2026-05-20T14:30");
  });

  it("ymFromPokerPlayedAt uses Singapore calendar month", () => {
    expect(ymFromPokerPlayedAt("2026-05-20T14:30:00+08:00")).toBe("2026-05");
  });

  it("formatPokerPlayedAtDisplay includes time", () => {
    const s = formatPokerPlayedAtDisplay("2026-05-20T14:30:00+08:00");
    expect(s).toMatch(/20/);
    expect(s.toLowerCase()).toMatch(/pm|am|\d/);
  });
});
