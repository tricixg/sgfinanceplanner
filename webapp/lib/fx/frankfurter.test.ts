import { describe, expect, it } from "vitest";
import { parseFrankfurterV2Rate } from "./frankfurter";

describe("parseFrankfurterV2Rate", () => {
  it("parses flat v2 rate response", () => {
    const result = parseFrankfurterV2Rate(
      { date: "2026-06-11", base: "TWD", quote: "SGD", rate: 0.04069 },
      "TWD",
      "SGD",
      "2026-06-11"
    );
    expect(result).toEqual({
      from: "TWD",
      to: "SGD",
      rate: 0.04069,
      rateDate: "2026-06-11",
      source: "frankfurter",
    });
  });

  it("parses legacy rates array response", () => {
    const result = parseFrankfurterV2Rate(
      {
        date: "2026-05-20",
        rates: [{ date: "2026-05-20", base: "USD", quote: "SGD", rate: 1.35 }],
      },
      "USD",
      "SGD",
      "2026-05-20"
    );
    expect(result?.rate).toBe(1.35);
    expect(result?.rateDate).toBe("2026-05-20");
  });

  it("returns null for invalid payload", () => {
    expect(parseFrankfurterV2Rate({}, "TWD", "SGD", "2026-06-11")).toBeNull();
  });
});
