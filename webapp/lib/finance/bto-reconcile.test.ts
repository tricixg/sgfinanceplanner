import { describe, expect, it } from "vitest";
import type { CpfTransaction } from "@/lib/cpf/types";
import { computeBTO, type BTOInputs } from "./bto";
import {
  btoProjectionAdjustments,
  reconcileBtoPayments,
  type BtoPaymentRow,
} from "./bto-reconcile";

// $480k 4-room, 10%/15% downpayment, $30k EHG, HDB loan.
const inputs: BTOInputs = {
  price: 480000,
  rate: 2.6,
  tenure: 25,
  optionFee: 2000,
  legalFee: 300,
  staggered: false,
  maxLoanEligible: 0,
  schemes: { ehg: { enabled: true, amountOverride: 30000 } },
  tSal: 5000,
  pSal: 4000,
  tOA: 60000,
  pOA: 40000,
  tOAMonthly: 1400,
  pOAMonthly: 1100,
  bookingOffsetMonths: 0,
  aflOffsetMonths: 3,
  kcOffsetMonths: 40,
};
const plan = computeBTO(inputs);

let seq = 0;
function row(p: Partial<CpfTransaction> & Pick<CpfTransaction, "category" | "amount">, owner: "self" | "partner" = "self"): BtoPaymentRow {
  return {
    id: String(++seq),
    txnDate: "2027-01-10",
    txnTime: null,
    direction: p.category === "housing_grant" ? "credit" : "debit",
    fundingSource: "cpf_oa",
    btoStage: "afl",
    note: "",
    createdAt: "",
    owner,
    ...p,
  };
}

describe("reconcileBtoPayments", () => {
  it("expects gross statement amounts per stage", () => {
    const r = reconcileBtoPayments(plan, []);
    expect(r.booking.expected).toBe(2000);
    // 10% downpayment less option fee, + BSD $9,000 + legal fee.
    expect(r.afl.expected).toBe(46000 + 9000 + 300);
    expect(r.afl.grantPlanned).toBe(30000);
    expect(r.keys.expected).toBe(72000);
    expect(r.afl.status).toBe("not_started");
  });

  it("tallies a stage paid by both of you plus cash, within $1", () => {
    const rows = [
      row({ category: "bto_option_fee", amount: 2000, btoStage: "booking", fundingSource: "cash" }),
      row({ category: "housing_grant", amount: 15000 }),
      row({ category: "housing_grant", amount: 15000 }, "partner"),
      row({ category: "bto_downpayment", amount: 30000 }),
      row({ category: "bto_downpayment", amount: 16000 }, "partner"),
      row({ category: "bto_bsd", amount: 9000 }),
      row({ category: "bto_legal_fee", amount: 300.4, fundingSource: "cash" }),
    ];
    const r = reconcileBtoPayments(plan, rows);
    expect(r.booking.status).toBe("tallied");
    expect(r.booking.paidCash).toBe(2000);
    expect(r.afl.status).toBe("tallied");
    expect(r.afl.bySelf).toBe(39000);
    expect(r.afl.byPartner).toBe(16000);
    expect(r.afl.paidCash).toBe(300.4);
    expect(r.afl.grantCredited).toBe(30000);
    expect(r.afl.components.find((c) => c.category === "bto_legal_fee")?.paid).toBe(300.4);
  });

  it("flags partial and overpaid stages", () => {
    expect(reconcileBtoPayments(plan, [row({ category: "bto_bsd", amount: 9000 })]).afl.status).toBe("partial");
    const over = reconcileBtoPayments(plan, [row({ category: "bto_option_fee", amount: 2500, btoStage: "booking" })]);
    expect(over.booking.status).toBe("over");
    expect(over.booking.variance).toBe(500);
  });

  it("counts mortgage instalments", () => {
    const m = { category: "bto_mortgage" as const, amount: plan.mortgage, btoStage: "mortgage" as const };
    const r = reconcileBtoPayments(plan, [row(m), row(m)]);
    expect(r.mortgage.monthsPaid).toBe(2);
    expect(r.mortgage.status).toBe("tallied");
  });
});

describe("btoProjectionAdjustments + computeBTO", () => {
  it("is a no-op when nothing is logged", () => {
    const a = btoProjectionAdjustments([]);
    expect(a).toEqual({ unspentGrantSelf: 0, unspentGrantPartner: 0, alreadyPaidAFL: 0, alreadyPaidKC: 0 });
    expect(plan.dueAFL).toBe(plan.neededAFL);
  });

  it("doesn't count a logged grant twice before AFL is paid", () => {
    // Grant credited: OA balances now include it.
    const rows = [row({ category: "housing_grant", amount: 15000 }), row({ category: "housing_grant", amount: 15000 }, "partner")];
    const a = btoProjectionAdjustments(rows);
    expect(a.unspentGrantSelf).toBe(15000);
    expect(a.unspentGrantPartner).toBe(15000);
    const adjusted = computeBTO({
      ...inputs,
      tOA: inputs.tOA + 15000 - a.unspentGrantSelf,
      pOA: inputs.pOA + 15000 - a.unspentGrantPartner,
      alreadyPaidAFL: a.alreadyPaidAFL,
    });
    expect(adjusted.cpfAvailAFL).toBeCloseTo(plan.cpfAvailAFL, 6);
    expect(adjusted.balAfterKC).toBeCloseTo(plan.balAfterKC, 6);
  });

  it("doesn't draw an AFL bill that was paid before its estimated date", () => {
    // Full AFL paid now (gross, grant money included), so the real OA balance
    // already reflects it: +30k grant − 55.3k gross bills.
    const rows = [
      row({ category: "housing_grant", amount: 30000 }),
      row({ category: "bto_downpayment", amount: 46000 }),
      row({ category: "bto_bsd", amount: 9000 }),
      row({ category: "bto_legal_fee", amount: 300 }),
    ];
    const a = btoProjectionAdjustments(rows);
    expect(a.unspentGrantSelf).toBe(0);
    expect(a.alreadyPaidAFL).toBeCloseTo(plan.neededAFL, 6);
    const after = computeBTO({
      ...inputs,
      tOA: inputs.tOA + 30000 - 55300,
      alreadyPaidAFL: a.alreadyPaidAFL,
    });
    expect(after.dueAFL).toBe(0);
    expect(after.cpfUsedAFL).toBe(0);
    // Ends where the never-paid projection does, less the ~3 months of OA
    // interest the early payment gave up (2.5% p.a. on ~$25k ≈ $171 compounded).
    const gap = plan.balAfterKC - after.balAfterKC;
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(plan.neededAFL * 0.01);
  });
});
