/** A logged monthly CPF contribution (OA/SA/MA split) — shown on CPF Outlook and used to drive the contribution-based projection. */
export type CpfContribution = {
  id: string;
  month: string;
  oa: number;
  sa: number;
  ma: number;
  note: string;
  /** Date the contribution was credited (YYYY-MM-DD, SGT); null for entries logged before migration 065. */
  creditedOn: string | null;
  createdAt: string;
};

export type CpfTxnDirection = "debit" | "credit";
export type CpfFundingSource = "cpf_oa" | "cash";
export type CpfBtoStage = "booking" | "afl" | "keys" | "mortgage";
export type CpfTxnCategory =
  | "bto_option_fee"
  | "bto_downpayment"
  | "bto_bsd"
  | "bto_legal_fee"
  | "bto_loan_shortfall"
  | "bto_mortgage"
  | "housing_grant"
  | "refund"
  | "other_withdrawal"
  | "other_credit";

/** A logged CPF OA movement (or cash-paid BTO bill) — see migration 064. */
export type CpfTransaction = {
  id: string;
  txnDate: string;
  direction: CpfTxnDirection;
  fundingSource: CpfFundingSource;
  amount: number;
  category: CpfTxnCategory;
  btoStage: CpfBtoStage | null;
  note: string;
  createdAt: string;
};

type CategoryMeta = {
  label: string;
  direction: CpfTxnDirection;
  /** BTO stages this category can be tagged to; first is the default. Empty = not a BTO row. */
  stages: CpfBtoStage[];
  /** Always paid in cash (HDB takes the option fee by cash/NETS, never CPF). */
  cashOnly?: boolean;
  /** Always a CPF OA movement (grants are credited straight to OA). */
  cpfOnly?: boolean;
};

export const CPF_TXN_CATEGORIES: Record<CpfTxnCategory, CategoryMeta> = {
  bto_option_fee: { label: "Option fee", direction: "debit", stages: ["booking"], cashOnly: true },
  bto_downpayment: { label: "Downpayment", direction: "debit", stages: ["afl", "keys"] },
  bto_bsd: { label: "Buyer's Stamp Duty", direction: "debit", stages: ["afl"] },
  bto_legal_fee: { label: "Legal fee", direction: "debit", stages: ["afl"] },
  bto_loan_shortfall: { label: "Loan shortfall top-up", direction: "debit", stages: ["keys"] },
  bto_mortgage: { label: "Mortgage instalment", direction: "debit", stages: ["mortgage"] },
  other_withdrawal: { label: "Other withdrawal", direction: "debit", stages: [] },
  housing_grant: { label: "Housing grant", direction: "credit", stages: ["afl", "keys"], cpfOnly: true },
  refund: { label: "Refund to OA", direction: "credit", stages: [] },
  other_credit: { label: "Other credit", direction: "credit", stages: [] },
};

export const CPF_BTO_STAGE_LABEL: Record<CpfBtoStage, string> = {
  booking: "Booking",
  afl: "Sign AFL",
  keys: "Key collection",
  mortgage: "Mortgage",
};

export function isCpfTxnCategory(v: unknown): v is CpfTxnCategory {
  return typeof v === "string" && v in CPF_TXN_CATEGORIES;
}

/** Signed effect of a row on the CPF OA balance (cash rows: 0). */
export function cpfTxnOaDelta(t: Pick<CpfTransaction, "direction" | "fundingSource" | "amount">): number {
  if (t.fundingSource !== "cpf_oa") return 0;
  return t.direction === "credit" ? t.amount : -t.amount;
}
