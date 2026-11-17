import { describe, expect, it } from "vitest";
import { normalizeCpfTransactionInput } from "./transactions";

const base = { txnDate: "2026-11-17", amount: 2000 };

describe("normalizeCpfTransactionInput", () => {
  it("forces the option fee to cash (HDB doesn't accept CPF for it)", () => {
    const row = normalizeCpfTransactionInput({ ...base, category: "bto_option_fee", fundingSource: "cpf_oa" });
    expect(row.funding_source).toBe("cash");
    expect(row.bto_stage).toBe("booking");
    expect(row.direction).toBe("debit");
  });

  it("forces a housing grant to CPF OA", () => {
    const row = normalizeCpfTransactionInput({ ...base, category: "housing_grant", fundingSource: "cash" });
    expect(row.funding_source).toBe("cpf_oa");
    expect(row.direction).toBe("credit");
    expect(row.bto_stage).toBe("afl");
  });

  it("rejects cash for non-BTO categories", () => {
    expect(() =>
      normalizeCpfTransactionInput({ ...base, category: "other_withdrawal", fundingSource: "cash" })
    ).toThrow(/Only BTO payments/);
  });

  it("defaults the stage and rejects a stage the category doesn't allow", () => {
    expect(normalizeCpfTransactionInput({ ...base, category: "bto_downpayment" }).bto_stage).toBe("afl");
    expect(normalizeCpfTransactionInput({ ...base, category: "bto_downpayment", btoStage: "keys" }).bto_stage).toBe("keys");
    expect(() =>
      normalizeCpfTransactionInput({ ...base, category: "bto_bsd", btoStage: "keys" })
    ).toThrow(/can't be tagged/);
    expect(normalizeCpfTransactionInput({ ...base, category: "refund" }).bto_stage).toBeNull();
  });

  it("rejects bad amounts and dates", () => {
    expect(() => normalizeCpfTransactionInput({ ...base, amount: 0, category: "refund" })).toThrow();
    expect(() => normalizeCpfTransactionInput({ ...base, txnDate: "17/11/2026", category: "refund" })).toThrow();
  });
});
