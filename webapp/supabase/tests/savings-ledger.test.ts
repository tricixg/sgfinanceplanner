/**
 * 070 savings ledger functions, exercised through the real TypeScript
 * wrappers (lib/savings/ledger.ts, lib/expenses/ledger-sync.ts) with `.rpc()`
 * executed as the signed-in user, so RLS applies exactly as via PostgREST.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyTransaction,
  applyTransactionWithReplay,
  deleteSavingsTransaction,
} from "@/lib/savings/ledger";
import { reverseExpenseLedger } from "@/lib/expenses/ledger-sync";
import type { Expense } from "@/lib/savings/types";
import { createTestDb, createUser, hasRealPostgres, rpcClientAs, type TestDb } from "./test-db";
import { balanceOf, count, newAccount, newExpense, newGoal, newHousehold, newPool } from "./fixtures";

let db: TestDb;
let alice: string;
let bob: string;
let mallory: string;

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db);
  bob = await createUser(db);
  mallory = await createUser(db);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

function expenseStub(id: string, userId: string): Expense {
  return {
    id,
    userId,
    amount: 0,
    category: "Food",
    budgetLineId: null,
    entrySource: "manual",
    autoCategory: null,
    loanId: null,
    otherLoanId: null,
    insurancePolicyId: null,
    ilpPolicyId: null,
    subscriptionId: null,
    investmentId: null,
    bnplId: null,
    fundId: null,
    financialAccountId: "fa",
    spentAt: "2026-11-01",
    note: "",
    createdAt: "2026-11-01T00:00:00Z",
  } as Expense;
}

describe("ledger_apply_savings_transaction", () => {
  it("deposits and withdraws with balance_after, goal saved amount and an audit row", async () => {
    const acct = await newAccount(db, alice, 100);
    const goal = await newGoal(db, { ownerUserId: alice, saved: 10, name: "Trip" });
    const sb = rpcClientAs(db, alice);

    const dep = await applyTransaction(sb, { userId: alice, accountId: acct, amount: 25.5, goalId: goal, note: "pay" });
    expect(dep.kind).toBe("deposit");
    expect(dep.amount).toBe(25.5);
    expect(dep.balanceAfter).toBe(125.5);
    expect(dep.goalName).toBe("Trip");
    expect(await balanceOf(db, "user_savings_accounts", acct)).toBe(125.5);
    expect(await balanceOf(db, "savings_goals", goal, "saved_amount")).toBe(35.5);

    const wd = await applyTransaction(sb, { userId: alice, accountId: acct, amount: -0.1 - 0.2 });
    expect(wd.kind).toBe("withdrawal");
    expect(wd.amount).toBe(-0.3);
    expect(await balanceOf(db, "user_savings_accounts", acct)).toBe(125.2);

    const audit = await db.query<{ operation: string; entity_type: string; delta: string; balance_after: string }>(
      "select operation, entity_type, delta, balance_after from ledger_audit_log where entity_id = $1 order by id",
      [acct]
    );
    expect(audit.map((a) => [a.operation, Number(a.delta), Number(a.balance_after)])).toEqual([
      ["savings.apply", 25.5, 125.5],
      ["savings.apply", -0.3, 125.2],
    ]);
  });

  it("rejects an overdraft with 'Insufficient balance' and changes nothing", async () => {
    const acct = await newAccount(db, alice, 20);
    const goal = await newGoal(db, { ownerUserId: alice, saved: 50 });
    const sb = rpcClientAs(db, alice);
    await expect(
      applyTransaction(sb, { userId: alice, accountId: acct, amount: -20.01, goalId: goal })
    ).rejects.toThrow("Insufficient balance");
    expect(await balanceOf(db, "user_savings_accounts", acct)).toBe(20);
    expect(await balanceOf(db, "savings_goals", goal, "saved_amount")).toBe(50);
    expect(await count(db, "select count(*) n from savings_transactions where account_id = $1", [acct])).toBe(0);
  });

  it("failure part-way (bad goal after the balance moved) rolls everything back", async () => {
    const acct = await newAccount(db, alice, 100);
    const bobGoal = await newGoal(db, { ownerUserId: bob, saved: 0 });
    const sb = rpcClientAs(db, alice);
    // Alice can't see Bob's goal → "Goal not found" after the account update ran.
    await expect(
      applyTransaction(sb, { userId: alice, accountId: acct, amount: 40, goalId: bobGoal })
    ).rejects.toThrow("Goal not found");
    expect(await balanceOf(db, "user_savings_accounts", acct)).toBe(100);
    expect(await count(db, "select count(*) n from savings_transactions where account_id = $1", [acct])).toBe(0);
    expect(await count(db, "select count(*) n from ledger_audit_log where entity_id = $1", [acct])).toBe(0);
  });

  it("keeps the goal floor at 0 like before", async () => {
    const acct = await newAccount(db, alice, 100);
    const goal = await newGoal(db, { ownerUserId: alice, saved: 5 });
    await applyTransaction(rpcClientAs(db, alice), { userId: alice, accountId: acct, amount: -30, goalId: goal });
    expect(await balanceOf(db, "savings_goals", goal, "saved_amount")).toBe(0);
  });

  it("enforces ownership: another user's account is 'Account not found', acting as someone else is 'Forbidden'", async () => {
    const acct = await newAccount(db, alice, 100);
    await expect(
      applyTransaction(rpcClientAs(db, mallory), { userId: mallory, accountId: acct, amount: -50 })
    ).rejects.toThrow("Account not found");
    await expect(
      applyTransaction(rpcClientAs(db, mallory), { userId: alice, accountId: acct, amount: -50 })
    ).rejects.toThrow("Forbidden");
    expect(await balanceOf(db, "user_savings_accounts", acct)).toBe(100);
  });

  it("pool transactions: household members only, shared goals only", async () => {
    const hh = await newHousehold(db, [alice, bob]);
    const pool = await newPool(db, hh, 0);
    const shared = await newGoal(db, { householdId: hh, saved: 0 });
    const personal = await newGoal(db, { ownerUserId: bob });

    const tx = await applyTransaction(rpcClientAs(db, bob), {
      userId: bob, poolId: pool, householdId: hh, amount: 300, goalId: shared,
    });
    expect(tx.balanceAfter).toBe(300);
    expect(await balanceOf(db, "savings_goals", shared, "saved_amount")).toBe(300);

    await expect(
      applyTransaction(rpcClientAs(db, bob), { userId: bob, poolId: pool, householdId: hh, amount: 1, goalId: personal })
    ).rejects.toThrow("Choose a shared savings goal");
    await expect(
      applyTransaction(rpcClientAs(db, mallory), { userId: mallory, poolId: pool, householdId: hh, amount: -300 })
    ).rejects.toThrow("Pool not found");
    expect(await balanceOf(db, "savings_pools", pool)).toBe(300);
  });

  it("same idempotency key twice → one row, one balance change, original result returned", async () => {
    const acct = await newAccount(db, alice, 100);
    const sb = rpcClientAs(db, alice);
    const input = { userId: alice, accountId: acct, amount: -30, clientRequestId: "req-abc-1" };

    const first = await applyTransactionWithReplay(sb, input);
    const second = await applyTransactionWithReplay(sb, input);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.transaction.id).toBe(first.transaction.id);
    expect(await balanceOf(db, "user_savings_accounts", acct)).toBe(70);
    expect(await count(db, "select count(*) n from savings_transactions where account_id = $1", [acct])).toBe(1);

    // Keys are per user: Bob may use the same string.
    const bobAcct = await newAccount(db, bob, 10);
    const bobTx = await applyTransactionWithReplay(rpcClientAs(db, bob), {
      userId: bob, accountId: bobAcct, amount: 5, clientRequestId: "req-abc-1",
    });
    expect(bobTx.replayed).toBe(false);
  });
});

describe("ledger_delete_savings_transaction", () => {
  it("reverses exactly: balance and goal return to where they were", async () => {
    const acct = await newAccount(db, alice, 100);
    const goal = await newGoal(db, { ownerUserId: alice, saved: 40 });
    const sb = rpcClientAs(db, alice);
    const tx = await applyTransaction(sb, { userId: alice, accountId: acct, amount: 33.33, goalId: goal });

    expect(await deleteSavingsTransaction(sb, alice, tx.id)).toBe(true);
    expect(await balanceOf(db, "user_savings_accounts", acct)).toBe(100);
    expect(await balanceOf(db, "savings_goals", goal, "saved_amount")).toBe(40);
    expect(await count(db, "select count(*) n from savings_transactions where id = $1", [tx.id])).toBe(0);
    // Deleting again is a no-op, not a second reversal.
    expect(await deleteSavingsTransaction(sb, alice, tx.id)).toBe(false);
    expect(await balanceOf(db, "user_savings_accounts", acct)).toBe(100);
  });

  it("refuses a delete that would overdraw and changes nothing", async () => {
    const acct = await newAccount(db, alice, 0);
    const sb = rpcClientAs(db, alice);
    const dep = await applyTransaction(sb, { userId: alice, accountId: acct, amount: 50 });
    await applyTransaction(sb, { userId: alice, accountId: acct, amount: -45 });
    await expect(deleteSavingsTransaction(sb, alice, dep.id)).rejects.toThrow("Insufficient balance");
    expect(await balanceOf(db, "user_savings_accounts", acct)).toBe(5);
    expect(await count(db, "select count(*) n from savings_transactions where id = $1", [dep.id])).toBe(1);
  });

  it("another user cannot delete (returns false, nothing changes)", async () => {
    const acct = await newAccount(db, alice, 0);
    const tx = await applyTransaction(rpcClientAs(db, alice), { userId: alice, accountId: acct, amount: 10 });
    expect(await deleteSavingsTransaction(rpcClientAs(db, mallory), mallory, tx.id)).toBe(false);
    expect(await balanceOf(db, "user_savings_accounts", acct)).toBe(10);
  });
});

describe("ledger_reverse_expense", () => {
  it("restores the account balance and deletes the linked savings and card rows", async () => {
    const acct = await newAccount(db, alice, 100);
    const exp = await newExpense(db, alice, 50);
    const sb = rpcClientAs(db, alice);
    await applyTransaction(sb, { userId: alice, accountId: acct, amount: -50, kind: "withdrawal", expenseId: exp });
    await db.query(
      `insert into budget_transactions (user_id, amount, spent_at, transaction_type, expense_id)
       values ($1, 50, '2026-11-01', 'expense', $2)`,
      [alice, exp]
    );
    expect(await balanceOf(db, "user_savings_accounts", acct)).toBe(50);

    await reverseExpenseLedger(sb, alice, expenseStub(exp, alice));
    expect(await balanceOf(db, "user_savings_accounts", acct)).toBe(100);
    expect(await count(db, "select count(*) n from savings_transactions where expense_id = $1", [exp])).toBe(0);
    expect(await count(db, "select count(*) n from budget_transactions where expense_id = $1", [exp])).toBe(0);
  });

  it("deletes record-only rows (no account) without touching balances", async () => {
    const exp = await newExpense(db, alice, 20);
    await db.query(
      `insert into savings_transactions (user_id, kind, amount, balance_after, expense_id)
       values ($1, 'withdrawal', -20, 0, $2)`,
      [alice, exp]
    );
    await reverseExpenseLedger(rpcClientAs(db, alice), alice, expenseStub(exp, alice));
    expect(await count(db, "select count(*) n from savings_transactions where expense_id = $1", [exp])).toBe(0);
  });

  it("is all-or-nothing: if one restore fails, no row is removed", async () => {
    // A refund-style positive row whose reversal would overdraw the account.
    const acct = await newAccount(db, alice, 0);
    const exp = await newExpense(db, alice, 10);
    const sb = rpcClientAs(db, alice);
    await applyTransaction(sb, { userId: alice, accountId: acct, amount: -0.01 + 10.01, expenseId: exp });
    await applyTransaction(sb, { userId: alice, accountId: acct, amount: -10 });
    await db.query(
      `insert into budget_transactions (user_id, amount, spent_at, transaction_type, expense_id)
       values ($1, 10, '2026-11-01', 'expense', $2)`,
      [alice, exp]
    );
    await expect(reverseExpenseLedger(sb, alice, expenseStub(exp, alice))).rejects.toThrow(
      "Insufficient balance for reversal"
    );
    expect(await count(db, "select count(*) n from savings_transactions where expense_id = $1", [exp])).toBe(1);
    expect(await count(db, "select count(*) n from budget_transactions where expense_id = $1", [exp])).toBe(1);
  });
});

describe.skipIf(!hasRealPostgres)("concurrency (real Postgres, separate connections)", () => {
  it("N parallel deposits leave balance = start + sum (no lost updates)", async () => {
    const acct = await newAccount(db, alice, 1000);
    const amounts = Array.from({ length: 40 }, (_, i) => Math.round((i + 1) * 1.37 * 100) / 100);
    await Promise.all(
      amounts.map((amount) => applyTransaction(rpcClientAs(db, alice), { userId: alice, accountId: acct, amount }))
    );
    const sum = amounts.reduce((a, b) => a + b, 0);
    expect(await balanceOf(db, "user_savings_accounts", acct)).toBeCloseTo(1000 + sum, 2);
    expect(await count(db, "select count(*) n from savings_transactions where account_id = $1", [acct])).toBe(40);
    // balance_after values are a strict running total: all distinct.
    expect(
      await count(db, "select count(distinct balance_after) n from savings_transactions where account_id = $1", [acct])
    ).toBe(40);
  });

  it("parallel withdrawals never overdraw: exactly floor(balance / amount) succeed", async () => {
    const acct = await newAccount(db, alice, 100);
    const results = await Promise.allSettled(
      Array.from({ length: 15 }, () =>
        applyTransaction(rpcClientAs(db, alice), { userId: alice, accountId: acct, amount: -30 })
      )
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect(ok).toBe(3);
    for (const r of results) {
      if (r.status === "rejected") expect(String(r.reason?.message)).toBe("Insufficient balance");
    }
    expect(await balanceOf(db, "user_savings_accounts", acct)).toBe(10);
  });

  it("the same idempotency key sent 10 times in parallel creates one row and one withdrawal", async () => {
    const acct = await newAccount(db, alice, 500);
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        applyTransactionWithReplay(rpcClientAs(db, alice), {
          userId: alice, accountId: acct, amount: -120, clientRequestId: "double-click-1",
        })
      )
    );
    expect(new Set(results.map((r) => r.transaction.id)).size).toBe(1);
    expect(results.filter((r) => !r.replayed).length).toBe(1);
    expect(await balanceOf(db, "user_savings_accounts", acct)).toBe(380);
    expect(await count(db, "select count(*) n from savings_transactions where account_id = $1", [acct])).toBe(1);
  });

  it("parallel deletes of the same row reverse it once", async () => {
    const acct = await newAccount(db, alice, 0);
    const tx = await applyTransaction(rpcClientAs(db, alice), { userId: alice, accountId: acct, amount: 75 });
    await applyTransaction(rpcClientAs(db, alice), { userId: alice, accountId: acct, amount: 100 });
    const results = await Promise.all(
      Array.from({ length: 8 }, () => deleteSavingsTransaction(rpcClientAs(db, alice), alice, tx.id))
    );
    expect(results.filter(Boolean).length).toBe(1);
    expect(await balanceOf(db, "user_savings_accounts", acct)).toBe(100);
  });

  it("partners depositing into the same pool at the same time don't lose updates", async () => {
    const carol = await createUser(db);
    const dave = await createUser(db);
    const hh = await newHousehold(db, [carol, dave]);
    const pool = await newPool(db, hh, 0);
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => {
        const who = i % 2 ? carol : dave;
        return applyTransaction(rpcClientAs(db, who), { userId: who, poolId: pool, householdId: hh, amount: 10 });
      })
    );
    expect(await balanceOf(db, "savings_pools", pool)).toBe(200);
  });
});
