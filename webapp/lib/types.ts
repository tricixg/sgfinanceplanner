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

export type BudgetItem = {
  cat: string;
  amt: number;
  type: "fixed" | "spend" | "save" | "invest";
};

export type Goal = {
  name: string;
  target: number;
  saved: number;
  by: string;
  where: string;
};

export type DashboardState = {
  monthlySal: number;
  comms: number;
  salaryCreditDay: number;
  fatty: number;
  house: number;
  manu: number;
  varSpend: number;
  eci: number;
  tpd: number;
  acc: number;
  oa: number;
  sa: number;
  ma: number;
  ilp: number;
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
