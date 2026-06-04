import { describe, expect, it } from "vitest";
import {
  formatTravelExpenseNote,
  parseTravelExpenseParts,
  parseTripSubCategoryFromNote,
} from "@/lib/travel/notes";

describe("travel note format + parse", () => {
  it("formats trip note with subcategory and optional detail", () => {
    expect(formatTravelExpenseNote("Japan Spring", "Flights")).toBe("Japan Spring - Flights");
    expect(formatTravelExpenseNote("Japan Spring", "Flights", "SQ 638")).toBe(
      "Japan Spring - Flights · SQ 638"
    );
  });

  it("parses subcategory from note prefix", () => {
    expect(parseTripSubCategoryFromNote("Japan Spring", "Japan Spring - Accoms · Tokyo 3N")).toBe(
      "Accoms"
    );
    expect(parseTripSubCategoryFromNote("Japan Spring", "Bali - Flights")).toBeNull();
  });

  it("parses extra note separately", () => {
    expect(
      parseTravelExpenseParts("Japan Spring", "Japan Spring - Flights · SQ 638")
    )?.toEqual({ subCategory: "Flights", extraNote: "SQ 638" });
  });
});
