export type OtherLoanType = "personal" | "balance_transfer";

/** Category of the card expense posted for a new BT's principal. */
export const BT_PRINCIPAL_EXPENSE_CATEGORY = "Balance transfer";

/** `depositFinancialAccountId` for a new BT whose funds aren't paid into a tracked cash account. */
export const NO_BT_DEPOSIT = "none";

/** BT principal moves money onto the card; it isn't spending for budgets or analytics. */
export function isBtPrincipalExpense(expense: { category?: string | null }): boolean {
  return expense.category === BT_PRINCIPAL_EXPENSE_CATEGORY;
}

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
  /**
   * New BTs only: cash account the BT funds are deposited into when first saved, or
   * NO_BT_DEPOSIT. When set, the principal is also posted as spend on the source card;
   * when absent (e.g. migrated legacy BTs) neither happens.
   */
  depositFinancialAccountId?: string;
  /** True when the BT principal is tracked as card spend (BTs added with the deposit flow). */
  principalTrackedOnCard?: boolean;
  amountPaid: number;
  paidAt?: string | null;
  /** When true (personal loans only), outstanding is omitted from net worth debt. */
  excludeFromNetWorth?: boolean;
};
