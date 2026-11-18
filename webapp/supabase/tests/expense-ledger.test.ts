/** 073 expense create/delete through lib/expenses/expense-write.ts, as the signed-in user. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createExpenseWithLedger, deleteExpenseWithLedger } from "@/lib/expenses/expense-write";
import type { ExpenseLedgerPlan } from "@/lib/expenses/ledger-sync";
import { createTestDb, createUser, hasRealPostgres, rpcClientAs, type TestDb } from "./test-db";
import { balanceOf, count, newAccount, newBnpl, newFund, newLoan, one } from "./fixtures";

let db: TestDb;
let alice: string;

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

const row = (amount: number, extra: Record<string, unknown> = {}) => ({
  user_id: alice,
  amount,
  category: "Food",
  spent_at: "2026-11-18",
  spent_time: "12:30:00",
  note: "lunch",
  ...extra,
});
const cash = (accountId: string): ExpenseLedgerPlan => ({
  type: "savings",
  account_id: accountId,
  occurred_at: "2026-11-18T04:30:00.000Z",
  note: "lunch",
});
const expensesWithKey = (key: string) =>
  count(db, "select count(*) n from expenses where user_id = $1 and client_request_id = $2", [alice, key]);

describe("expense_create_with_ledger", () => {
  it("cash expense: expense row + withdrawal linked to it", async () => {
    const acct = await newAccount(db, alice, 100);
    const { expense, replayed } = await createExpenseWithLedger(rpcClientAs(db, alice), alice, {
      row: row(12.5),
      ledger: cash(acct),
    });
    expect(replayed).toBe(false);
    expect(expense).toMatchObject({ amount: 12.5, category: "Food", note: "lunch", userId: alice });
    expect(await balanceOf(db, "user_savings_accounts", acct)).toBe(87.5);
    const tx = await one<{ amount: string; kind: string }>(
      db, "select amount, kind from savings_transactions where expense_id = $1", [expense.id]
    );
    expect([Number(tx.amount), tx.kind]).toEqual([-12.5, "withdrawal"]);
  });

  it("card expense writes the budget ledger row with expense_id", async () => {
    const { expense } = await createExpenseWithLedger(rpcClientAs(db, alice), alice, {
      row: row(40),
      ledger: {
        type: "budget",
        row: { user_id: alice, amount: 40, category: "Food", spent_at: "2026-11-18", spent_time: "04:30:00",
               note: "lunch", transaction_type: "expense", ledger: "Visa", currency: "SGD" },
      },
    });
    expect(await count(db, "select count(*) n from budget_transactions where expense_id = $1", [expense.id])).toBe(1);
  });

  it("insufficient cash leaves no expense behind", async () => {
    const acct = await newAccount(db, alice, 5);
    await expect(
      createExpenseWithLedger(rpcClientAs(db, alice), alice, { row: row(9.99, { note: "no-money" }), ledger: cash(acct) })
    ).rejects.toThrow("Insufficient balance");
    expect(await count(db, "select count(*) n from expenses where note = 'no-money'")).toBe(0);
    expect(await balanceOf(db, "user_savings_accounts", acct)).toBe(5);
  });

  it("loan payment, then a failing ledger step, rolls back the loan too", async () => {
    const loan = await newLoan(db, alice, 1000);
    const acct = await newAccount(db, alice, 1);
    await expect(
      createExpenseWithLedger(rpcClientAs(db, alice), alice, {
        row: row(500, { auto_category: "debt", loan_id: loan }),
        loanId: loan,
        ledger: cash(acct),
      })
    ).rejects.toThrow("Insufficient balance");
    expect(await balanceOf(db, "loans", loan, "outstanding")).toBe(1000);

    await createExpenseWithLedger(rpcClientAs(db, alice), alice, {
      row: row(500, { auto_category: "debt", loan_id: loan }),
      loanId: loan,
    });
    expect(await balanceOf(db, "loans", loan, "outstanding")).toBe(500);
  });

  it("BNPL and recurring-invest payments move months_paid and the fund", async () => {
    const plan = await newBnpl(db, alice, 6, 1);
    await createExpenseWithLedger(rpcClientAs(db, alice), alice, {
      row: row(100, { auto_category: "bnpl", bnpl_id: plan }),
      bnplId: plan,
    });
    expect(await balanceOf(db, "bnpl_plans", plan, "months_paid")).toBe(2);

    const fund = await newFund(db, alice, 0);
    await createExpenseWithLedger(rpcClientAs(db, alice), alice, {
      row: row(250, { auto_category: "invest", fund_id: fund }),
      fund: { fundId: fund, note: "Recurring invest: ETF" },
    });
    expect(await balanceOf(db, "investment_funds", fund)).toBe(250);
  });

  it("same idempotency key twice → one expense, one withdrawal, same id returned", async () => {
    const acct = await newAccount(db, alice, 100);
    const sb = rpcClientAs(db, alice);
    const input = { row: row(30), ledger: cash(acct), clientRequestId: "exp-retry-0001" };
    const a = await createExpenseWithLedger(sb, alice, input);
    const b = await createExpenseWithLedger(sb, alice, input);
    expect([a.replayed, b.replayed]).toEqual([false, true]);
    expect(b.expense.id).toBe(a.expense.id);
    expect(await expensesWithKey("exp-retry-0001")).toBe(1);
    expect(await balanceOf(db, "user_savings_accounts", acct)).toBe(70);
  });
});

describe("expense_delete_with_ledger", () => {
  it("reverses the withdrawal, deletes the expense and restores the loan; second delete is a no-op", async () => {
    const acct = await newAccount(db, alice, 1000);
    const loan = await newLoan(db, alice, 2000);
    const sb = rpcClientAs(db, alice);
    const { expense } = await createExpenseWithLedger(sb, alice, {
      row: row(300, { auto_category: "debt", loan_id: loan }),
      loanId: loan,
      ledger: cash(acct),
    });
    expect([await balanceOf(db, "user_savings_accounts", acct), await balanceOf(db, "loans", loan, "outstanding")]).toEqual([700, 1700]);

    expect(await deleteExpenseWithLedger(sb, alice, expense.id)).not.toBeNull();
    expect([await balanceOf(db, "user_savings_accounts", acct), await balanceOf(db, "loans", loan, "outstanding")]).toEqual([1000, 2000]);
    expect(await count(db, "select count(*) n from expenses where id = $1", [expense.id])).toBe(0);
    expect(await count(db, "select count(*) n from savings_transactions where expense_id = $1", [expense.id])).toBe(0);

    expect(await deleteExpenseWithLedger(sb, alice, expense.id)).toBeNull();
    expect(await balanceOf(db, "loans", loan, "outstanding")).toBe(2000);
  });

  it("restores BNPL months on delete (both delete paths now do)", async () => {
    const plan = await newBnpl(db, alice, 6, 0);
    const sb = rpcClientAs(db, alice);
    const a = await createExpenseWithLedger(sb, alice, { row: row(100, { auto_category: "bnpl", bnpl_id: plan }), bnplId: plan });
    expect(await balanceOf(db, "bnpl_plans", plan, "months_paid")).toBe(1);
    await deleteExpenseWithLedger(sb, alice, a.expense.id);
    expect(await balanceOf(db, "bnpl_plans", plan, "months_paid")).toBe(0);
  });

  it("076: if the fund can't cover the reversal, the delete is refused and nothing changes", async () => {
    const fund = await newFund(db, alice, 0);
    const sb = rpcClientAs(db, alice);
    const { expense } = await createExpenseWithLedger(sb, alice, {
      row: row(250, { auto_category: "invest", fund_id: fund }),
      fund: { fundId: fund, note: "Recurring invest: ETF" },
    });
    await db.query("update investment_funds set balance = 100 where id = $1", [fund]); // spent elsewhere
    await expect(deleteExpenseWithLedger(sb, alice, expense.id)).rejects.toThrow(
      "Can't delete this payment: the fund no longer holds enough to reverse it (it has $100.00, this payment was $250.00)."
    );
    expect(await balanceOf(db, "investment_funds", fund)).toBe(100);
    expect(await count(db, "select count(*) n from expenses where id = $1", [expense.id])).toBe(1);

    await db.query("update investment_funds set balance = 300 where id = $1", [fund]);
    await deleteExpenseWithLedger(sb, alice, expense.id);
    expect(await balanceOf(db, "investment_funds", fund)).toBe(50);
    expect(await count(db, "select count(*) n from expenses where id = $1", [expense.id])).toBe(0);
  });

  it("a deleted loan clears the expense's link (ON DELETE SET NULL), so its payment can still be deleted", async () => {
    const loan = await newLoan(db, alice, 1000);
    const sb = rpcClientAs(db, alice);
    const { expense } = await createExpenseWithLedger(sb, alice, {
      row: row(100, { auto_category: "debt", loan_id: loan }),
      loanId: loan,
    });
    await db.query("delete from loans where id = $1", [loan]);
    expect(await deleteExpenseWithLedger(sb, alice, expense.id)).not.toBeNull();
    expect(await count(db, "select count(*) n from expenses where id = $1", [expense.id])).toBe(0);
  });

  it("if the cash reversal would overdraw, nothing is deleted", async () => {
    const acct = await newAccount(db, alice, 0);
    const sb = rpcClientAs(db, alice);
    // A refund-type positive ledger row linked to an expense.
    const { expense } = await createExpenseWithLedger(sb, alice, { row: row(10) });
    await db.query(
      `insert into savings_transactions (user_id, account_id, kind, amount, balance_after, expense_id)
       values ($1, $2, 'deposit', 10, 10, $3)`,
      [alice, acct, expense.id]
    );
    await expect(
      deleteExpenseWithLedger(sb, alice, expense.id)
    ).rejects.toThrow("Insufficient balance for reversal");
    expect(await count(db, "select count(*) n from expenses where id = $1", [expense.id])).toBe(1);
  });
});

describe.skipIf(!hasRealPostgres)("expense concurrency (real Postgres)", () => {
  it("double-click: 10 parallel POSTs with one key → one expense, one withdrawal", async () => {
    const acct = await newAccount(db, alice, 100);
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        createExpenseWithLedger(rpcClientAs(db, alice), alice, {
          row: row(45), ledger: cash(acct), clientRequestId: "exp-dblclick-1",
        })
      )
    );
    expect(new Set(results.map((r) => r.expense.id)).size).toBe(1);
    expect(await expensesWithKey("exp-dblclick-1")).toBe(1);
    expect(await balanceOf(db, "user_savings_accounts", acct)).toBe(55);
  });

  it("without a key, parallel distinct expenses all apply exactly", async () => {
    const acct = await newAccount(db, alice, 1000);
    await Promise.all(
      Array.from({ length: 20 }, () =>
        createExpenseWithLedger(rpcClientAs(db, alice), alice, { row: row(7.77), ledger: cash(acct) })
      )
    );
    expect(await balanceOf(db, "user_savings_accounts", acct)).toBe(Math.round((1000 - 20 * 7.77) * 100) / 100);
  });
});
