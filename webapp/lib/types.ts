import type { BTOSchemeSelection } from "./finance/bto-schemes";

export type Loan = {
  name: string;
  card: string;
  monthly: number;
  out: number;
  end: string;
};

export type { CardRewardType, SpendCategory } from "./cards/sg-card-catalog";

export type CreditCardRewardRule = {
  category: string;
  earn: string;
  cap?: string;
};

export type CreditCard = {
  name: string;
  statementDay: number;
  paymentDueDay: number;
  statementAmount: number;
  /** Link to [sg-card-catalog] entry; rewards snapshot stored below. */
  catalogId?: string;
  bank?: string;
  rewardType?: import("./cards/sg-card-catalog").CardRewardType;
  rewardHeadline?: string;
  rewardRules?: CreditCardRewardRule[];
};

export type HoldingMarket = "SGX" | "US";

export type Holding = {
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
};

export type PortfolioSnapshot = {
  recordedAt: string;
  totalValue: number;
  totalCost: number;
};

/** Singapore investment-linked policy (ILP) — insurance + unit-linked funds. */
export type IlpPolicy = {
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
};

/** Non-ILP insurance (term, PA, CI, etc.) — premiums flow to Budget & Savings. */
export type InsurancePolicy = {
  name: string;
  insurer: string;
  monthlyPremium: number;
  notes: string;
};

export type BudgetItem = {
  cat: string;
  amt: number;
  type: "fixed" | "spend" | "save" | "invest";
};

/** Savings / cash account — balances feed net worth and cashflow. */
export type SavingsAccount = {
  name: string;
  balance: number;
  notes: string;
};

export type Goal = {
  name: string;
  target: number;
  /** Progress toward goal (not used for total cash — see accounts on ME). */
  saved: number;
  by: string;
  where: string;
};

/** Persisted BTO Planner inputs (schemes, salaries, flat assumptions). */
export type BtoPlannerPrefs = {
  price: number;
  ltv: number;
  rate: number;
  tenure: number;
  yrsToKeys: number;
  applicationYm: string;
  tSal: number;
  pSal: number;
  pOA: number;
  schemes: BTOSchemeSelection;
};

export type DashboardState = {
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
  creditCards: CreditCard[];
  btoPlanner?: BtoPlannerPrefs;
};
