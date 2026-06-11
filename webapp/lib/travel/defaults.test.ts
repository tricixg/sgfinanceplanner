import { describe, expect, it } from "vitest";
import { DEFAULT_TRAVEL_SUBCATEGORIES } from "@/lib/travel/defaults";

describe("DEFAULT_TRAVEL_SUBCATEGORIES", () => {
  it("includes the standard trip budget lines", () => {
    expect([...DEFAULT_TRAVEL_SUBCATEGORIES]).toEqual([
      "Flight",
      "Transport",
      "Accomodation",
      "Attractions",
      "Food",
      "Misc",
    ]);
  });
});
