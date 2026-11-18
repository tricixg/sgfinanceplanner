/** DATA-006: the seed statement PostgREST generates for upsert(..., { ignoreDuplicates }) */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, createUser, hasRealPostgres, type TestDb } from "./test-db";
import { count } from "./fixtures";

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
}, 120_000);
afterAll(async () => {
  await db?.close();
});

const SEED = `insert into income_categories (user_id, name, slug, sort_order)
  values ($1, 'Salary', 'salary', 0), ($1, 'Others', 'others', 1)
  on conflict (user_id, slug) do nothing`;

describe("income category seeding", () => {
  it("re-running the seed is a no-op (unique (user_id, slug) index is usable as the conflict target)", async () => {
    const u = await createUser(db);
    await db.asUser(u, SEED, [u]);
    await db.asUser(u, SEED, [u]);
    expect(await count(db, "select count(*) n from income_categories where user_id = $1", [u])).toBe(2);
  });

  it.skipIf(!hasRealPostgres)("concurrent first loads seed one set and none fails", async () => {
    const u = await createUser(db);
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => db.asUser(u, SEED, [u])));
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await count(db, "select count(*) n from income_categories where user_id = $1", [u])).toBe(2);
  });
});
