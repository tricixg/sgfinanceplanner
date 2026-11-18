import { describe, expect, it } from "vitest";
import { checkMigrationNames } from "./migration-rules";

describe("checkMigrationNames", () => {
  it("accepts a clean sequence", () => {
    expect(checkMigrationNames(["001_a.sql", "002_b_c.sql"])).toEqual([]);
  });
  it("flags duplicates, gaps and bad names", () => {
    expect(checkMigrationNames(["001_a.sql", "001_b.sql"])).toEqual([
      "001_b.sql: number 001 already used by 001_a.sql",
    ]);
    expect(checkMigrationNames(["001_a.sql", "003_c.sql"])).toEqual([
      "003_c.sql: expected number 002 (no gaps)",
    ]);
    expect(checkMigrationNames(["001_A.sql"])).toEqual(["001_A.sql: name must be NNN_snake_case.sql"]);
  });
});
