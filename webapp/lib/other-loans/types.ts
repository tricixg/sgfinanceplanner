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
  /** Promo / final due date (YYYY-MM-DD). BT: no card interest before this date. */
  dueDate?: string;
  /** Credit card the BT was applied from (card_key in UI). */
  sourceCreditCardId?: string;
  defaultFinancialAccountId?: string;
  amountPaid: number;
  paidAt?: string | null;
  /** When true (personal loans only), outstanding is omitted from net worth debt. */
  excludeFromNetWorth?: boolean;
};
