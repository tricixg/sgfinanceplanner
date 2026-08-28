import type { BTOSchemeSelection } from "./finance/bto-schemes";
import type { MilesPlannerPrefs } from "./miles/types";

export type Loan = {
  id?: string;
  name: string;
  /** Display label — kept in sync with linked credit card name. */
  card: string;
  /** Links to CreditCard.id (Debts & Loans → Credit Cards). */
  cardId?: string;
  monthly: number;
  out: number;
  end: string;
  /** Day of month (1–31) when instalment is typically charged. */
  deductionDay?: number;
  /** Default cash or card account for recording payments. */
  defaultFinancialAccountId?: string;
};

export type { CardRewardType, SpendCategory } from "./cards/sg-card-catalog";

export type CreditCardRewardRule = {
  category: string;
  earn: string;
  cap?: string;
};

export type CreditCard = {
  /** Stable key for linking instalment plans from Debts & Loans. */
  id?: string;
  name: string;
  statementDay: number;
  paymentDueDay: number;
  statementAmount: number;
  /** Annual interest rate % p.a. for revolving balance after due date. */
  interestRateApr?: number;
  /** When true, statement breakdown counts linked plan outstanding (out), not only monthly. */
  includeOutstandingOnStatement?: boolean;
  /** Link to [sg-card-catalog] entry; rewards snapshot stored below. */
  catalogId?: string;
  bank?: string;
  rewardType?: import("./cards/sg-card-catalog").CardRewardType;
  rewardHeadline?: string;
  rewardRules?: CreditCardRewardRule[];
  /** Hidden from the card list/statements views but still saved and still counts toward totals. */
  hidden?: boolean;
};

export type HoldingMarket = "SGX" | "US";

export type Holding = {
  /** DB row id — absent until the holding is first saved. */
  id?: string;
  name: string;
  ticker: string;
  market: HoldingMarket;
  qty: number;
  /** User-entered average cost per share (SGD). */
  avgCost: number;
  /** Last live quote or manual price per share (SGD). */
  lastPrice: number;
  lastPriceAt?: string;
  sector: string;
  /** Lifetime sum of dividend payouts recorded for this holding — realized P&L. */
  lifetimeDividends?: number;
};

export type PortfolioSnapshot = {
  recordedAt: string;
  totalValue: number;
  totalCost: number;
};

/** Month-end net worth snapshot; `lnw` excludes CPF so the include-CPF toggle can be applied retroactively. */
export type NetWorthSnapshot = {
  month: string;
  lnw: number;
  cpf: number;
};

/** Singapore investment-linked policy (ILP) — insurance + unit-linked funds. */
export type IlpPolicy = {
  id?: string;
  insurer: string;
  planName: string;
  policyNo: string;
  premiumType: "regular" | "single";
  /** front-end: low allocation early years; back-end: 100% units but surrender fees; single: lump sum */
  loadingType: "front-end" | "back-end" | "single";
  monthlyPremium: number;
  /** Welcome / allocation bonus credited at policy start (SGD) — lowers net premiums for profit. */
  initialBonus: number;
  accountValue: number;
  /** % of premium used to buy units this policy year (allocation rate) */
  premiumAllocationPct: number;
  /** Minimum investment / lock-in end (YYYY-MM) */
  lockInEndYm: string;
  policyStartYm: string;
  /** Back-end loaded: surrender charge period end (YYYY-MM) */
  surrenderChargeEndYm: string;
  insuranceCover: number;
  funds: string;
  freeFundSwitchesPerYear: number;
  notes: string;
  /** Day of month (1–31) when premium is typically charged. */
  deductionDay?: number;
  defaultFinancialAccountId?: string;
};

/** Non-ILP insurance (term, PA, CI, etc.) — premiums flow to Budget & Savings. */
export type InsurancePolicy = {
  id?: string;
  name: string;
  insurer: string;
  monthlyPremium: number;
  notes: string;
  /** Day of month (1–31) when premium is typically charged. */
  deductionDay?: number;
  defaultFinancialAccountId?: string;
};

export type RecurringSubscription = {
  id?: string;
  name: string;
  amount: number;
  notes: string;
  deductionDay?: number;
  defaultFinancialAccountId?: string;
  endMonth?: string;
  /** Optional link to an existing budget category (BudgetItem.id). */
  budgetLineId?: string;
};

/** Recurring contribution into an investment fund — like RecurringSubscription,
 *  but always routes into a specific fund on payment. */
export type RecurringInvestment = {
  id?: string;
  name: string;
  amount: number;
  notes: string;
  deductionDay?: number;
  defaultFinancialAccountId?: string;
  endMonth?: string;
  /** Optional link to an existing budget category (BudgetItem.id), usually type "invest". */
  budgetLineId?: string;
  /** Required — which investment_funds row this grows on payment. */
  fundId: string;
};

export type BudgetItem = {
  id?: string;
  cat: string;
  amt: number;
  type: "fixed" | "spend" | "save" | "invest";
};

/** Savings / cash account — local JSON or legacy; cloud uses user_savings_accounts. */
export type SavingsAccount = {
  name: string;
  balance: number;
  notes: string;
  /** Count toward Savings tab totals (always true for legacy rows). */
  includeInSavings?: boolean;
};

export type Goal = {
  name: string;
  target: number;
  /** Progress toward goal (not used for total cash — see accounts on ME). */
  saved: number;
  by: string;
  where: string;
};

/** OA growth projection source for the BTO planner's payment waterfall. */
export type BtoOAGrowthMode = "salary" | "manual" | "contributions";

/** Persisted BTO Planner inputs (schemes, salaries, flat assumptions). */
export type BtoPlannerPrefs = {
  /** BTO project name, e.g. "Berlayar Rise". */
  projectName: string;
  price: number;
  rate: number;
  tenure: number;
  yrsToKeys: number;
  applicationYm: string;
  /** Months from booking to Agreement for Lease. */
  monthsToAFL: number;
  /** Option fee paid in cash at booking. */
  optionFee: number;
  /** Legal fee paid in cash at AFL. */
  legalFee: number;
  /** Staggered Downpayment Scheme: 5% @ AFL / 20% @ keys instead of 10% / 15%. */
  staggered: boolean;
  /** Bank/HDB-assessed max loan amount (AIP/HLE letter); 0 = not set, use HDB's fixed 75% max LTV. */
  maxLoanEligible: number;
  tSal: number;
  pSal: number;
  pOA: number;
  /** OA growth projection mode, tracked independently for self and partner. */
  tOaGrowthMode: BtoOAGrowthMode;
  pOaGrowthMode: BtoOAGrowthMode;
  /** Manual monthly OA contribution, used when the respective mode === "manual". */
  tOAMonthly: number;
  pOAMonthly: number;
  /** Queue number and total flat supply from the balloting result; 0 = not set. */
  queueNumber: number;
  queueTotal: number;
  /** Actual milestone dates ("YYYY-MM-DD") once known from HDB — "" = not set, use the estimate. */
  bookingDateActual: string;
  aflDateActual: string;
  keysDateActual: string;
  schemes: BTOSchemeSelection;
};

export type DashboardPrefs = Record<string, never>;

export type DashboardState = {
  prefs?: DashboardPrefs;
  monthlySal: number;
  comms: number;
  salaryCreditDay: number;
  insurancePolicies: InsurancePolicy[];
  accounts: SavingsAccount[];
  oa: number;
  sa: number;
  ma: number;
  ilpPolicies: IlpPolicy[];
  moo: number;
  margin: number;
  cash: number;
  ccDebt: number;
  cashflowStartYm: string;
  holdings: Holding[];
  portfolioHistory: PortfolioSnapshot[];
  budget: BudgetItem[];
  goals: Goal[];
  loans: Loan[];
  otherLoans: import("./other-loans/types").OtherLoan[];
  creditCards: CreditCard[];
  btoPlanner?: BtoPlannerPrefs;
  milesPlanner?: MilesPlannerPrefs;
};
