import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, migrationFiles, MIGRATIONS_DIR, type TestDb } from "./test-db";
import { checkMigrationNames, IDEMPOTENT_FROM } from "./migration-rules";

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb(); // applies every migration once, in order
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("supabase/migrations (OPS-001)", () => {
  it("file names are NNN_snake_case.sql, numbered 001.. with no gaps or duplicates", () => {
    expect(checkMigrationNames(migrationFiles())).toEqual([]);
  });

  it(`every migration from ${String(IDEMPOTENT_FROM).padStart(3, "0")} on can be run a second time`, async () => {
    const failures: string[] = [];
    for (const f of migrationFiles()) {
      if (Number(f.slice(0, 3)) < IDEMPOTENT_FROM) continue;
      try {
        await db.exec(readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
      } catch (e) {
        failures.push(`${f}: ${(e as Error).message}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
