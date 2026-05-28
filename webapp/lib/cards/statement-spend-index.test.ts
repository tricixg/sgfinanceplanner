import { describe, expect, it } from "vitest";
import { resolveSpendDay } from "@/lib/cards/statement-spend-index";

describe("resolveSpendDay", () => {
  it("prefers spent_at when present", () => {
    expect(
      resolveSpendDay({
        spent_at: "2026-05-15",
        created_at: "2026-05-28T03:00:00.000Z",
      })
    ).toBe("2026-05-15");
  });

  it("falls back to created_at when spent_at is missing", () => {
    expect(
      resolveSpendDay({
        spent_at: null,
        created_at: "2026-05-28T03:00:00.000Z",
      })
    ).toBe("2026-05-28");
  });

  it("returns null when neither date is valid", () => {
    expect(
      resolveSpendDay({
        spent_at: null,
        created_at: null,
      })
    ).toBeNull();
  });
});
