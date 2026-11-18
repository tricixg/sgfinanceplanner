/** 072 loan / BNPL / other-loan functions. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adjustLoanOutstanding } from "@/lib/expenses/auto-payment";
import { adjustBnplMonthsPaid } from "@/lib/recurring/load";
import { restoreOtherLoanDrawDown, restoreOtherLoanPayment } from "@/lib/other-loans/pay";
import { createTestDb, createUser, hasRealPostgres, rpcClientAs, type TestDb } from "./test-db";
import { balanceOf, count, newAccount, newBnpl, newLoan, newOtherLoan, one } from "./fixtures";

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

type LoanRow = { outstanding: string; principal: string; amount_paid: string; paid_at: string | null };
const loanRow = (id: string) =>
  one<LoanRow>(db, "select outstanding, principal, amount_paid, paid_at from other_loans where id = $1", [id]);

const PAY_SQL = `select public.other_loan_record_payment(
  p_user_id => $1, p_loan_id => $2, p_amount => $3, p_savings_account_id => $4,
  p_financial_account_id => null, p_category => 'Debts & Loans', p_spent_at => '2026-11-18',
  p_spent_time => '10:00:00', p_occurred_at => now(), p_note => 'Loan payment: Loan') as id`;

describe("loans and BNPL", () => {
  it("adjustLoanOutstanding: atomic, floor 0, 'Loan not found' for others", async () => {
    const loan = await newLoan(db, alice, 1000);
    expect(await adjustLoanOutstanding(rpcClientAs(db, alice), alice, loan, -33.333)).toEqual({ ok: true, outstanding: 966.67 });
    expect(await adjustLoanOutstanding(rpcClientAs(db, alice), alice, loan, -5000)).toEqual({ ok: true, outstanding: 0 });
    expect(await adjustLoanOutstanding(rpcClientAs(db, mallory), mallory, loan, 100)).toEqual({ ok: false, error: "Loan not found" });
    expect(await balanceOf(db, "loans", loan, "outstanding")).toBe(0);
  });

  it("adjustBnplMonthsPaid clamps to 0..tenure", async () => {
    const plan = await newBnpl(db, alice, 3, 2);
    expect(await adjustBnplMonthsPaid(rpcClientAs(db, alice), alice, plan, 1)).toEqual({ ok: true, monthsPaid: 3 });
    expect(await adjustBnplMonthsPaid(rpcClientAs(db, alice), alice, plan, 1)).toEqual({ ok: true, monthsPaid: 3 });
    expect(await adjustBnplMonthsPaid(rpcClientAs(db, alice), alice, plan, -5)).toEqual({ ok: true, monthsPaid: 0 });
    expect(await adjustBnplMonthsPaid(rpcClientAs(db, mallory), mallory, plan, 1)).toEqual({ ok: false, error: "BNPL plan not found" });
  });
});

describe("other loans", () => {
  it("restoreOtherLoanPayment adds back to outstanding and never takes amount_paid below 0", async () => {
    const loan = await newOtherLoan(db, alice, { outstanding: 400, amountPaid: 100 });
    expect(await restoreOtherLoanPayment(rpcClientAs(db, alice), alice, loan, 150)).toEqual({ ok: true });
    const row = await loanRow(loan);
    expect(Number(row.outstanding)).toBe(550);
    expect(Number(row.amount_paid)).toBe(0);
  });

  it("restoreOtherLoanDrawDown clamps outstanding and principal at 0; unknown loan errors", async () => {
    const loan = await newOtherLoan(db, alice, { outstanding: 50, principal: 80 });
    expect(await restoreOtherLoanDrawDown(rpcClientAs(db, alice), alice, loan, 100)).toEqual({ ok: true });
    const row = await loanRow(loan);
    expect([Number(row.outstanding), Number(row.principal)]).toEqual([0, 0]);
    expect(await restoreOtherLoanDrawDown(rpcClientAs(db, mallory), mallory, loan, 1)).toEqual({
      ok: false,
      error: "Loan not found",
    });
  });

  it("record payment: expense + withdrawal + loan totals in one go; fully paid sets paid_at", async () => {
    const acct = await newAccount(db, alice, 1000);
    const loan = await newOtherLoan(db, alice, { outstanding: 300 });
    const [{ id: expenseId }] = await db.asUser<{ id: string }>(alice, PAY_SQL, [alice, loan, 300, acct]);

    expect(await balanceOf(db, "user_savings_accounts", acct)).toBe(700);
    const row = await loanRow(loan);
    expect([Number(row.outstanding), Number(row.amount_paid)]).toEqual([0, 300]);
    expect(row.paid_at).not.toBeNull();
    const exp = await one<{ auto_category: string; other_loan_id: string; amount: string }>(
      db, "select auto_category, other_loan_id, amount from expenses where id = $1", [expenseId]
    );
    expect(exp).toMatchObject({ auto_category: "debt", other_loan_id: loan });
    expect(await count(db, "select count(*) n from savings_transactions where expense_id = $1 and source_record_type = 'other_loan'", [expenseId])).toBe(1);
  });

  it("record payment that overdraws the account leaves no expense, no row and the loan untouched", async () => {
    const acct = await newAccount(db, alice, 10);
    const loan = await newOtherLoan(db, alice, { outstanding: 300 });
    const before = await count(db, "select count(*) n from expenses where other_loan_id = $1", [loan]);
    await expect(db.asUser(alice, PAY_SQL, [alice, loan, 100, acct])).rejects.toThrow("Insufficient balance");
    expect(await count(db, "select count(*) n from expenses where other_loan_id = $1", [loan])).toBe(before);
    expect(Number((await loanRow(loan)).outstanding)).toBe(300);
    expect(await balanceOf(db, "user_savings_accounts", acct)).toBe(10);
  });

  it("record payment without an account writes a record-only history row; over-payment is refused", async () => {
    const loan = await newOtherLoan(db, alice, { outstanding: 120.5 });
    await db.asUser(alice, PAY_SQL, [alice, loan, 20, null]);
    expect(await count(db, "select count(*) n from savings_transactions where source_record_id = $1 and account_id is null", [loan])).toBe(1);
    await expect(db.asUser(alice, PAY_SQL, [alice, loan, 200, null])).rejects.toThrow(
      "Payment exceeds outstanding (100.5)"
    );
  });

  it("balance transfers can't be paid or topped up here", async () => {
    const bt = await newOtherLoan(db, alice, { outstanding: 100, type: "balance_transfer" });
    await expect(db.asUser(alice, PAY_SQL, [alice, bt, 10, null])).rejects.toThrow(
      "Balance transfer is paid from Credit Cards statement payment"
    );
    await expect(
      db.asUser(alice, `select public.other_loan_add_draw_down($1, $2, 10, null, now(), 'x')`, [alice, bt])
    ).rejects.toThrow("Balance transfers cannot be topped up this way");
  });

  it("draw-down deposits cash and raises outstanding and principal together", async () => {
    const acct = await newAccount(db, alice, 0);
    const loan = await newOtherLoan(db, alice, { outstanding: 100, principal: 100 });
    await db.asUser(alice, `select public.other_loan_add_draw_down($1, $2, 250, $3, now(), 'Loan draw-down: Loan')`, [alice, loan, acct]);
    expect(await balanceOf(db, "user_savings_accounts", acct)).toBe(250);
    const row = await loanRow(loan);
    expect([Number(row.outstanding), Number(row.principal)]).toEqual([350, 350]);
  });
});

describe.skipIf(!hasRealPostgres)("loan concurrency (real Postgres)", () => {
  it("parallel payments can't overpay: the row lock re-checks outstanding", async () => {
    const loan = await newOtherLoan(db, alice, { outstanding: 100 });
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => db.asUser(alice, PAY_SQL, [alice, loan, 40, null]))
    );
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(2);
    const row = await loanRow(loan);
    expect([Number(row.outstanding), Number(row.amount_paid)]).toEqual([20, 80]);
  });

  it("parallel loan adjustments don't lose updates", async () => {
    const loan = await newLoan(db, alice, 10000);
    await Promise.all(
      Array.from({ length: 25 }, () => adjustLoanOutstanding(rpcClientAs(db, alice), alice, loan, -100))
    );
    expect(await balanceOf(db, "loans", loan, "outstanding")).toBe(7500);
  });
});
