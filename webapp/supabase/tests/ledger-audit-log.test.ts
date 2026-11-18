import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, createUser, type TestDb } from "./test-db";

let db: TestDb;
let alice: string;
let bob: string;

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db);
  bob = await createUser(db);
  // Rows as the ledger functions would write them (owner context).
  await db.query(
    `select private.ledger_audit_append($1, 'test.op', 'savings_account', gen_random_uuid(), 10, 110, 'k1', '{}')`,
    [alice]
  );
  await db.query(
    `select private.ledger_audit_append($1, 'test.op', 'savings_account', gen_random_uuid(), 5, 5, null, '{}')`,
    [bob]
  );
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("069 ledger_audit_log", () => {
  it("users read only their own rows", async () => {
    const rows = await db.asUser<{ user_id: string }>(alice, "select user_id from ledger_audit_log");
    expect(rows.length).toBe(1);
    expect(rows[0]!.user_id).toBe(alice);
  });

  it("users cannot insert, update or delete rows directly", async () => {
    await expect(
      db.asUser(
        alice,
        `insert into ledger_audit_log (user_id, operation, entity_type) values ($1, 'x', 'y')`,
        [alice]
      )
    ).rejects.toThrow(/permission denied|row-level security/);
    await expect(
      db.asUser(alice, `update ledger_audit_log set delta = 0`)
    ).rejects.toThrow(/permission denied/);
    await expect(db.asUser(alice, `delete from ledger_audit_log`)).rejects.toThrow(
      /permission denied/
    );
  });

  it("rows are never updated, even by the owner", async () => {
    await expect(db.query(`update ledger_audit_log set delta = 0`)).rejects.toThrow(
      /append-only/
    );
  });

  it("the audit writer records auth.uid(), not a forged user id", async () => {
    await db.asUser(
      alice,
      `select private.ledger_audit_append($1, 'forge', 'savings_account', null, 1, 1, null, '{}')`,
      [bob]
    );
    const rows = await db.query<{ user_id: string }>(
      `select user_id from ledger_audit_log where operation = 'forge'`
    );
    expect(rows.map((r) => r.user_id)).toEqual([alice]);
  });
});
