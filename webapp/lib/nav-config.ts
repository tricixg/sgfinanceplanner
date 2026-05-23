export type AppRouteId =
  | "thisMonth"
  | "budget"
  | "savings"
  | "expenses"
  | "debt"
  | "cards"
  | "wealth"
  | "cpf"
  | "now"
  | "year"
  | "bto"
  | "me"
  | "transactions";

export type NavTab = {
  id: AppRouteId;
  label: string;
  summary: string;
  href: string;
};

export const NAV_GROUPS: { category: string; tabs: NavTab[] }[] = [
  {
    category: "Overview",
    tabs: [
      {
        id: "thisMonth",
        label: "This Month",
        href: "/this-month",
        summary:
          "Net worth breakdown, monthly calendar, and credit card statement totals.",
      },
    ],
  },
  {
    category: "Planning",
    tabs: [
      {
        id: "budget",
        label: "Budget",
        href: "/budget",
        summary:
          "Take-home pay vs budget categories; loans and insurance auto-linked from other tabs.",
      },
      {
        id: "savings",
        label: "Savings & Goals",
        href: "/savings",
        summary:
          "Personal and shared savings accounts, goals, and progress (separate from budget).",
      },
      {
        id: "expenses",
        label: "Expenses",
        href: "/expenses",
        summary: "Private expense log — loaded separately, not with the main dashboard.",
      },
      {
        id: "now",
        label: "5-Month Cashflow",
        href: "/now",
        summary:
          "Five-month income vs fixed spend, loans, insurance, and where surplus goes.",
      },
      {
        id: "year",
        label: "5-Year Projection",
        href: "/year",
        summary:
          "Wealth growth scenarios using budget, CPF, and investment assumptions.",
      },
      {
        id: "bto",
        label: "BTO Planner",
        href: "/bto",
        summary:
          "Purchase price, grants, loan, downpayment, and cash needed for your flat.",
      },
    ],
  },
  {
    category: "Accounts",
    tabs: [
      {
        id: "debt",
        label: "Debts & Loans",
        href: "/debt",
        summary:
          "Instalment plans and card balances — feeds cashflow, calendar, and burn-down charts.",
      },
      {
        id: "cards",
        label: "Credit Cards",
        href: "/cards",
        summary:
          "Singapore card catalog, rewards snapshot, and spend advisor for which card to use.",
      },
      {
        id: "wealth",
        label: "Investment",
        href: "/wealth",
        summary: "Holdings with live prices and P&L, plus Manulife-style ILP policies.",
      },
      {
        id: "cpf",
        label: "CPF Outlook",
        href: "/cpf",
        summary:
          "OA, SA, and MediSave balances for BTO planning, net worth, and long-term projections.",
      },
    ],
  },
  {
    category: "Configuration",
    tabs: [
      {
        id: "me",
        label: "ME",
        href: "/me",
        summary:
          "Salary, savings accounts, non-ILP insurance, and import/export settings.",
      },
    ],
  },
];

export const TRANSACTIONS_NAV: NavTab = {
  id: "transactions",
  label: "Transaction history",
  href: "/transactions",
  summary: "Unified savings ledger and budget CSV imports.",
};

export const ALL_NAV_TABS = NAV_GROUPS.flatMap((g) => g.tabs);

export function navTabForPath(pathname: string): NavTab | undefined {
  if (pathname === "/transactions" || pathname.startsWith("/transactions?")) {
    return TRANSACTIONS_NAV;
  }
  return ALL_NAV_TABS.find(
    (t) => pathname === t.href || pathname.startsWith(`${t.href}/`)
  );
}
