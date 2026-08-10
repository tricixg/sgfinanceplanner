export type OtherLoanType = "personal" | "balance_transfer";

export type OtherLoan = {
  id?: string;
  name: string;
  loanType: OtherLoanType;
  principal: number;
  outstanding: number;
  interestRateApr: number;
  tenureMonths?: number;
  feesPaid: number;
  /** Monthly instalment (personal loans only) — folded into the Debts & Loans budget row. */
  monthly: number;
  /** Promo / final due date (YYYY-MM-DD). BT: no card interest before this date. */
  dueDate?: string;
  /** BT start date (YYYY-MM-DD) used to post one-time finance charge to card spend. */
  btStartDate?: string;
  /** One-time manual finance charge applied on BT start date. */
  financeCharge?: number;
  /** Credit card the BT was applied from (card_key in UI). */
  sourceCreditCardId?: string;
  defaultFinancialAccountId?: string;
  amountPaid: number;
  paidAt?: string | null;
  /** When true (personal loans only), outstanding is omitted from net worth debt. */
  excludeFromNetWorth?: boolean;
};
