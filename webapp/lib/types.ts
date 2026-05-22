export type Loan = {
  name: string;
  card: string;
  monthly: number;
  out: number;
  end: string;
};

export type CreditCard = {
  name: string;
  statementDay: number;
  paymentDueDay: number;
  statementAmount: number;
};

export type Holding = {
  name: string;
  ticker: string;
  qty: number;
  price: number;
  sector: string;
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
  budget: BudgetItem[];
  goals: Goal[];
  loans: Loan[];
  creditCards: CreditCard[];
};
