/** 074 CPF functions through lib/cpf/{contributions,transactions}.ts, as the signed-in user. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addCpfContribution,
  deleteCpfContribution,
  updateCpfContribution,
} from "@/lib/cpf/contributions";
import { addCpfTransaction, deleteCpfTransaction, updateCpfTransaction } from "@/lib/cpf/transactions";
import { createTestDb, createUser, hasRealPostgres, rpcClientAs, type TestDb } from "./test-db";
import { count, one } from "./fixtures";

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
}, 120_000);

afterAll(async () => {
  await db?.close();
});

async function userWithCpf(oa: number, sa = 0, ma = 0): Promise<string> {
  const u = await createUser(db);
  await db.query("insert into user_finance_profile (user_id, oa, sa, ma) values ($1, $2, $3, $4)", [u, oa, sa, ma]);
  return u;
}
const cpf = async (u: string) => {
  const r = await one<{ oa: string; sa: string; ma: string }>(db, "select oa, sa, ma from user_finance_profile where user_id = $1", [u]);
  return { oa: Number(r.oa), sa: Number(r.sa), ma: Number(r.ma) };
};

describe("CPF contributions", () => {
  it("add then delete returns exactly to the start (no clamp involved)", async () => {
    const u = await userWithCpf(1000.1, 500, 200);
    const sb = rpcClientAs(db, u);
    const added = await addCpfContribution(sb, u, { month: "2026-10-01", oa: 0.2, sa: 300, ma: 400, creditedOn: "2026-11-05" });
    expect(added.profile).toEqual({ oa: 1000.3, sa: 800, ma: 600 }); // exact numeric, no float drift
    expect(added.contribution).toMatchObject({ month: "2026-10-01", oa: 0.2, creditedOn: "2026-11-05" });

    expect(await deleteCpfContribution(sb, u, added.contribution.id)).toEqual({ oa: 1000.1, sa: 500, ma: 200 });
    expect(await cpf(u)).toEqual({ oa: 1000.1, sa: 500, ma: 200 });
  });

  it("CURRENT BEHAVIOUR (kept): the 0-floor makes add → lower OA by hand → delete not return to start", async () => {
    const u = await userWithCpf(100);
    const sb = rpcClientAs(db, u);
    const c = await addCpfContribution(sb, u, { month: "2026-09-01", oa: 500, sa: 0, ma: 0 });
    await db.query("update user_finance_profile set oa = 200 where user_id = $1", [u]); // manual edit
    expect((await deleteCpfContribution(sb, u, c.contribution.id)).oa).toBe(0); // 200 - 500 floored
    const audit = await one<{ details: { clamped: boolean } }>(
      db, "select details from ledger_audit_log where user_id = $1 and operation = 'cpf.contribution.delete'", [u]
    );
    expect(audit.details.clamped).toBe(true);
  });

  it("update moves balances by the difference", async () => {
    const u = await userWithCpf(1000, 1000, 1000);
    const sb = rpcClientAs(db, u);
    const c = await addCpfContribution(sb, u, { month: "2026-08-01", oa: 100, sa: 100, ma: 100 });
    const res = await updateCpfContribution(sb, u, c.contribution.id, { month: "2026-08-01", oa: 150, sa: 50, ma: 100 });
    expect(res.profile).toEqual({ oa: 1150, sa: 1050, ma: 1100 });
  });

  it("a second log for the same month keeps today's message and changes nothing", async () => {
    const u = await userWithCpf(0);
    const sb = rpcClientAs(db, u);
    await addCpfContribution(sb, u, { month: "2026-07-01", oa: 10, sa: 0, ma: 0 });
    await expect(addCpfContribution(sb, u, { month: "2026-07-01", oa: 10, sa: 0, ma: 0 })).rejects.toThrow(
      "Already logged a contribution for 2026-07-01 — delete it first to re-log."
    );
    expect((await cpf(u)).oa).toBe(10);
  });

  it("creates a missing profile row the way saveFinanceProfile did", async () => {
    const u = await createUser(db);
    await addCpfContribution(rpcClientAs(db, u), u, { month: "2026-06-01", oa: 1, sa: 2, ma: 3 });
    const row = await one<{ oa: string; salary_credit_day: number; cashflow_start_ym: string }>(
      db, "select oa, salary_credit_day, cashflow_start_ym from user_finance_profile where user_id = $1", [u]
    );
    expect(Number(row.oa)).toBe(1);
    expect(row.salary_credit_day).toBe(0);
    expect(row.cashflow_start_ym).toMatch(/^\d{4}-\d{2}$/);
  });

  it("same idempotency key twice → one row, balances moved once", async () => {
    const u = await userWithCpf(0);
    const sb = rpcClientAs(db, u);
    const input = { month: "2026-05-01", oa: 100, sa: 0, ma: 0, clientRequestId: "cpf-contrib-0001" };
    const a = await addCpfContribution(sb, u, input);
    const b = await addCpfContribution(sb, u, input);
    expect(b.contribution.id).toBe(a.contribution.id);
    expect(b.profile.oa).toBe(100);
    expect(await count(db, "select count(*) n from cpf_contributions where user_id = $1", [u])).toBe(1);
  });

  it("can't delete someone else's contribution", async () => {
    const u = await userWithCpf(0);
    const other = await userWithCpf(0);
    const c = await addCpfContribution(rpcClientAs(db, u), u, { month: "2026-04-01", oa: 5, sa: 0, ma: 0 });
    await expect(deleteCpfContribution(rpcClientAs(db, other), other, c.contribution.id)).rejects.toThrow("Contribution not found");
    expect((await cpf(u)).oa).toBe(5);
  });
});

describe("CPF transactions", () => {
  it("OA debit and credit; cash-funded BTO payment doesn't touch OA; delete reverses", async () => {
    const u = await userWithCpf(10000);
    const sb = rpcClientAs(db, u);
    const debit = await addCpfTransaction(sb, u, { txnDate: "2026-11-01", category: "bto_downpayment", amount: 2500.55 });
    expect(debit.oa).toBe(7499.45);
    const cash = await addCpfTransaction(sb, u, { txnDate: "2026-11-01", category: "bto_downpayment", amount: 999, fundingSource: "cash" });
    expect(cash.oa).toBe(7499.45);
    const credit = await addCpfTransaction(sb, u, { txnDate: "2026-11-02", category: "housing_grant", amount: 500 });
    expect(credit.oa).toBe(7999.45);

    expect((await deleteCpfTransaction(sb, u, debit.transaction.id)).oa).toBe(10500);
    expect((await deleteCpfTransaction(sb, u, cash.transaction.id)).oa).toBe(10500);
  });

  it("switching a payment from CPF to cash gives OA back", async () => {
    const u = await userWithCpf(5000);
    const sb = rpcClientAs(db, u);
    const t = await addCpfTransaction(sb, u, { txnDate: "2026-11-01", category: "bto_downpayment", amount: 1000 });
    expect(t.oa).toBe(4000);
    const res = await updateCpfTransaction(sb, u, t.transaction.id, {
      txnDate: "2026-11-01", category: "bto_downpayment", amount: 1000, fundingSource: "cash",
    });
    expect(res.oa).toBe(5000);
    expect(res.transaction.fundingSource).toBe("cash");
  });

  it("CURRENT BEHAVIOUR (kept): a debit larger than OA floors at 0, so deleting it overshoots", async () => {
    const u = await userWithCpf(300);
    const sb = rpcClientAs(db, u);
    const t = await addCpfTransaction(sb, u, { txnDate: "2026-11-01", category: "other_withdrawal", amount: 500 });
    expect(t.oa).toBe(0);
    expect((await deleteCpfTransaction(sb, u, t.transaction.id)).oa).toBe(500); // not 300
  });

  it("same idempotency key twice → one row, OA moved once", async () => {
    const u = await userWithCpf(1000);
    const sb = rpcClientAs(db, u);
    const input = { txnDate: "2026-11-01", category: "other_withdrawal" as const, amount: 100, clientRequestId: "cpf-txn-00001" };
    const a = await addCpfTransaction(sb, u, input);
    const b = await addCpfTransaction(sb, u, input);
    expect(b.transaction.id).toBe(a.transaction.id);
    expect(b.oa).toBe(900);
    expect(await count(db, "select count(*) n from cpf_transactions where user_id = $1", [u])).toBe(1);
  });
});

describe.skipIf(!hasRealPostgres)("CPF concurrency (real Postgres)", () => {
  it("parallel OA credits don't lose updates", async () => {
    const u = await userWithCpf(0);
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        addCpfTransaction(rpcClientAs(db, u), u, { txnDate: `2026-10-${String(i + 1).padStart(2, "0")}`, category: "other_credit", amount: 25 })
      )
    );
    expect((await cpf(u)).oa).toBe(500);
  });
});
