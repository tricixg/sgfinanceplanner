import type { CpfBtoStage, CpfTransaction, CpfTxnCategory } from "@/lib/cpf/types";

/** A BTO payment row, tagged with whose account it came from. */
export type BtoPaymentRow = CpfTransaction & { owner: "self" | "partner" };

/** The subset of computeBTO() output the reconciliation needs. */
export type BtoPlanBills = {
  optionFee: number;
  dpAFL: number;
  dpKCBase: number;
  loanShortfall: number;
  bsd: number;
  legalFee: number;
  mortgage: number;
  grantAppliedAFL: number;
  grantAppliedKC: number;
};

export type BtoReconcileStatus = "not_started" | "partial" | "tallied" | "over";

export type BtoReconcileComponent = {
  category: CpfTxnCategory;
  label: string;
  /** Gross amount the CPF statement / HDB bill shows for this item. */
  expected: number;
  paid: number;
};

export type BtoStageReconcile = {
  stage: CpfBtoStage;
  components: BtoReconcileComponent[];
  /** Gross total of the stage's bills (what leaves CPF OA + cash). */
  expected: number;
  /** All debits logged against this stage (CPF + cash, you + partner). */
  paid: number;
  paidCpf: number;
  paidCash: number;
  bySelf: number;
  byPartner: number;
  /** Housing grant the plan expects to fund this stage's downpayment. */
  grantPlanned: number;
  /** Housing grant credits actually logged against this stage. */
  grantCredited: number;
  /** paid − expected; negative = still to pay. */
  variance: number;
  status: BtoReconcileStatus;
  /** Mortgage only: instalments logged. */
  monthsPaid?: number;
};

const TOLERANCE = 1;

const round2 = (n: number) => Math.round(n * 100) / 100;

function expectedComponents(stage: CpfBtoStage, b: BtoPlanBills): BtoReconcileComponent[] {
  const c = (category: CpfTxnCategory, label: string, expected: number) => ({
    category,
    label,
    expected: round2(Math.max(0, expected)),
    paid: 0,
  });
  switch (stage) {
    case "booking":
      return [c("bto_option_fee", "Option fee", b.optionFee)];
    case "afl":
      // CPF withdraws the full downpayment (less the option fee already paid),
      // grant money included — the grant shows up as a separate OA credit.
      return [
        c("bto_downpayment", "Downpayment", b.dpAFL - b.optionFee),
        c("bto_bsd", "Buyer's Stamp Duty", b.bsd),
        c("bto_legal_fee", "Legal fee", b.legalFee),
      ];
    case "keys": {
      const rows = [c("bto_downpayment", "Downpayment", b.dpKCBase)];
      if (b.loanShortfall > 0) rows.push(c("bto_loan_shortfall", "Loan shortfall top-up", b.loanShortfall));
      return rows;
    }
    case "mortgage":
      return [c("bto_mortgage", "Monthly instalment", b.mortgage)];
  }
}

const sum = (rows: { amount: number }[]) => round2(rows.reduce((s, r) => s + r.amount, 0));

/**
 * Compares logged BTO payments (yours + partner's) against the bills the
 * planner expects at each stage. Amounts are gross, matching the CPF
 * statement: a grant is credited to OA and then withdrawn as part of the
 * downpayment, so it is reported as a funding line, not deducted from the bill.
 */
export function reconcileBtoPayments(
  b: BtoPlanBills,
  rows: BtoPaymentRow[]
): Record<CpfBtoStage, BtoStageReconcile> {
  const stages: CpfBtoStage[] = ["booking", "afl", "keys", "mortgage"];
  const out = {} as Record<CpfBtoStage, BtoStageReconcile>;
  for (const stage of stages) {
    const stageRows = rows.filter((r) => r.btoStage === stage);
    const debits = stageRows.filter((r) => r.direction === "debit");
    const components = expectedComponents(stage, b).map((comp) => ({
      ...comp,
      paid: sum(debits.filter((r) => r.category === comp.category)),
    }));
    const paid = sum(debits);
    const grantCredited = sum(stageRows.filter((r) => r.category === "housing_grant"));
    const grantPlanned = round2(stage === "afl" ? b.grantAppliedAFL : stage === "keys" ? b.grantAppliedKC : 0);

    let expected = round2(components.reduce((s, c) => s + c.expected, 0));
    let status: BtoReconcileStatus;
    let monthsPaid: number | undefined;
    if (stage === "mortgage") {
      monthsPaid = debits.filter((r) => r.category === "bto_mortgage").length;
      // Expected grows with each logged month; nothing logged = not started.
      expected = round2(b.mortgage * Math.max(1, monthsPaid));
    }
    const variance = round2(paid - expected);
    if (paid === 0) status = "not_started";
    else if (Math.abs(variance) < TOLERANCE) status = "tallied";
    else status = variance > 0 ? "over" : "partial";

    out[stage] = {
      stage,
      components,
      expected,
      paid,
      paidCpf: sum(debits.filter((r) => r.fundingSource === "cpf_oa")),
      paidCash: sum(debits.filter((r) => r.fundingSource === "cash")),
      bySelf: sum(debits.filter((r) => r.owner === "self" && r.fundingSource === "cpf_oa")),
      byPartner: sum(debits.filter((r) => r.owner === "partner" && r.fundingSource === "cpf_oa")),
      grantPlanned,
      grantCredited,
      variance,
      status,
      monthsPaid,
    };
  }
  return out;
}

/**
 * What logged payments mean for the CPF projection, so computeBTO() neither
 * double-counts a grant sitting in OA nor draws a bill that's already paid.
 *
 * - `unspentGrant`: grant credits still sitting in this person's OA (credited
 *   but not yet used by an AFL/keys payment). computeBTO already credits grants
 *   straight against the bills, so this amount is taken back out of the
 *   starting OA it projects from.
 * - `alreadyPaidAFL` / `alreadyPaidKC`: bill money already paid from the
 *   household's own funds (debits net of grant money, which the plan already
 *   netted off), so the projection only draws what's left.
 */
export function btoProjectionAdjustments(rows: BtoPaymentRow[]) {
  const isDp = (r: BtoPaymentRow) => r.direction === "debit" && (r.btoStage === "afl" || r.btoStage === "keys");
  const grants = (owner?: "self" | "partner") =>
    sum(rows.filter((r) => r.category === "housing_grant" && (!owner || r.owner === owner)));
  const unspentFor = (owner: "self" | "partner") => {
    // Any AFL/keys payment (CPF or cash) counts as using up grant money first
    // — this keeps the starting OA consistent with alreadyPaid* below.
    const paid = sum(rows.filter((r) => r.owner === owner && isDp(r)));
    return round2(Math.max(0, grants(owner) - paid));
  };

  const totalGrant = grants();
  const paidAFL = sum(rows.filter((r) => r.direction === "debit" && r.btoStage === "afl"));
  const paidKC = sum(rows.filter((r) => r.direction === "debit" && r.btoStage === "keys"));
  // Grant money funds AFL first, then key collection — same order as computeBTO.
  const alreadyPaidAFL = round2(Math.max(0, paidAFL - totalGrant));
  const grantLeft = Math.max(0, totalGrant - paidAFL);
  const alreadyPaidKC = round2(Math.max(0, paidKC - grantLeft));

  return {
    unspentGrantSelf: unspentFor("self"),
    unspentGrantPartner: unspentFor("partner"),
    alreadyPaidAFL,
    alreadyPaidKC,
  };
}
