/** 071 fund ledger functions through lib/funds/ledger.ts, as the signed-in user. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyFundTransaction,
  applyFundTransactionWithReplay,
  deleteFundTransaction,
} from "@/lib/funds/ledger";
import { createTestDb, createUser, hasRealPostgres, rpcClientAs, type TestDb } from "./test-db";
import { balanceOf, count, newFund, newGoal } from "./fixtures";

let db: TestDb;
let alice: string;
let mallory: string;

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db);
  mallory = await createUser(db);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("ledger_apply_fund_transaction / ledger_delete_fund_transaction", () => {
  it("deposit with a goal, then delete, returns both to the start exactly", async () => {
    const fund = await newFund(db, alice, 1000);
    const goal = await newGoal(db, { ownerUserId: alice, saved: 200, name: "House" });
    const sb = rpcClientAs(db, alice);

    const tx = await applyFundTransaction(sb, { userId: alice, fundId: fund, amount: 250.25, goalId: goal, kind: "deposit" });
    expect(tx.balanceAfter).toBe(1250.25);
    expect(tx.goalName).toBe("House");
    expect(await balanceOf(db, "savings_goals", goal, "saved_amount")).toBe(450.25);

    await deleteFundTransaction(sb, alice, fund, tx.id);
    expect(await balanceOf(db, "investment_funds", fund)).toBe(1000);
    expect(await balanceOf(db, "savings_goals", goal, "saved_amount")).toBe(200);
    await expect(deleteFundTransaction(sb, alice, fund, tx.id)).rejects.toThrow("Transaction not found");
    expect(await balanceOf(db, "investment_funds", fund)).toBe(1000);
  });

  it("overdraft fails with 'Insufficient balance' and leaves no trace", async () => {
    const fund = await newFund(db, alice, 10);
    await expect(
      applyFundTransaction(rpcClientAs(db, alice), { userId: alice, fundId: fund, amount: -10.01 })
    ).rejects.toThrow("Insufficient balance");
    expect(await balanceOf(db, "investment_funds", fund)).toBe(10);
    expect(await count(db, "select count(*) n from fund_transactions where fund_id = $1", [fund])).toBe(0);
  });

  it("a bad goal after the balance moved rolls back the balance (no manual revert needed)", async () => {
    const fund = await newFund(db, alice, 10);
    const sharedHh = (await db.query<{ id: string }>("insert into households default values returning id"))[0]!.id;
    const shared = await newGoal(db, { householdId: sharedHh });
    await expect(
      applyFundTransaction(rpcClientAs(db, alice), { userId: alice, fundId: fund, amount: 5, goalId: shared })
    ).rejects.toThrow("Goal not found"); // not visible to Alice (not a member)
    expect(await balanceOf(db, "investment_funds", fund)).toBe(10);
  });

  it("another user's fund is not found; acting as someone else is forbidden", async () => {
    const fund = await newFund(db, alice, 10);
    await expect(
      applyFundTransaction(rpcClientAs(db, mallory), { userId: mallory, fundId: fund, amount: -10 })
    ).rejects.toThrow("Fund not found");
    await expect(
      applyFundTransaction(rpcClientAs(db, mallory), { userId: alice, fundId: fund, amount: -10 })
    ).rejects.toThrow("Forbidden");
    expect(await balanceOf(db, "investment_funds", fund)).toBe(10);
  });

  it("same idempotency key twice → one row, one balance change", async () => {
    const fund = await newFund(db, alice, 0);
    const sb = rpcClientAs(db, alice);
    const input = { userId: alice, fundId: fund, amount: 500, kind: "deposit" as const, clientRequestId: "fund-req-0001" };
    const a = await applyFundTransactionWithReplay(sb, input);
    const b = await applyFundTransactionWithReplay(sb, input);
    expect([a.replayed, b.replayed]).toEqual([false, true]);
    expect(b.transaction.id).toBe(a.transaction.id);
    expect(await balanceOf(db, "investment_funds", fund)).toBe(500);
    expect(await count(db, "select count(*) n from fund_transactions where fund_id = $1", [fund])).toBe(1);
  });
});

describe.skipIf(!hasRealPostgres)("fund concurrency (real Postgres)", () => {
  it("N parallel deposits leave balance = start + sum", async () => {
    const fund = await newFund(db, alice, 50);
    await Promise.all(
      Array.from({ length: 30 }, () =>
        applyFundTransaction(rpcClientAs(db, alice), { userId: alice, fundId: fund, amount: 12.34 })
      )
    );
    expect(await balanceOf(db, "investment_funds", fund)).toBe(50 + 30 * 12.34);
  });

  it("same key in parallel → one deposit", async () => {
    const fund = await newFund(db, alice, 0);
    await Promise.all(
      Array.from({ length: 10 }, () =>
        applyFundTransactionWithReplay(rpcClientAs(db, alice), {
          userId: alice, fundId: fund, amount: 99, clientRequestId: "fund-parallel-1",
        })
      )
    );
    expect(await balanceOf(db, "investment_funds", fund)).toBe(99);
  });
});
