import { describe, expect, it } from "vitest";
import { isPlausibleDateOfBirth } from "./load";

describe("isPlausibleDateOfBirth", () => {
  const today = "2026-11-17";
  it.each(["1990-06-15", "2026-11-17", "1907-01-01"])("accepts %s", (v) => {
    expect(isPlausibleDateOfBirth(v, today)).toBe(true);
  });
  it.each(["2026-11-18", "1900-01-01", "1990-02-30", "1990-13-01", "15/06/1990", ""])(
    "rejects %s",
    (v) => {
      expect(isPlausibleDateOfBirth(v, today)).toBe(false);
    }
  );
});
