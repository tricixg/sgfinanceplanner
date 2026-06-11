export type AppRouteId =
  | "thisMonth"
  | "thisMonthCashflow"
  | "cashAccounts"
  | "budget"
  | "savings"
  | "expenses"
  | "pastSpendings"
  | "recurring"
  | "transactions"
  | "travel"
  | "poker"
  | "debt"
  | "cards"
  | "wealth"
  | "cpf"
  | "now"
  | "year"
  | "bto"
  | "me";

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
        summary: "Monthly calendar, statement totals, and upcoming events.",
      },
      {
        id: "thisMonthCashflow",
        label: "This Month Cashflow",
        href: "/this-month-cashflow",
        summary: "This month in/out with actual credit card statement bills due.",
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
        id: "pastSpendings",
        label: "Past Spendings",
        href: "/past-spendings",
        summary:
          "Five-month spending trends by category and card to spot overspend and cut costs.",
      },
      {
        id: "savings",
        label: "Savings & Goals",
        href: "/savings",
        summary:
          "Personal and shared savings accounts, goals, and progress (separate from budget).",
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
    category: "Tracking",
    tabs: [
      {
        id: "expenses",
        label: "Expenses",
        href: "/expenses",
        summary: "Private expense log — loaded separately, not with the main dashboard.",
      },
      {
        id: "recurring",
        label: "Recurring",
        href: "/recurring",
        summary:
          "Monthly debt, insurance, ILP, and subscription payments — mark paid and track pay-from account.",
      },
      {
        id: "transactions",
        label: "Transaction history",
        href: "/transactions",
        summary: "Unified savings, budget, and expense transaction history.",
      },
      {
        id: "travel",
        label: "Travel",
        href: "/travel",
        summary: "Trip budgets and actual travel spending by category.",
      },
      {
        id: "poker",
        label: "Poker tracker",
        href: "/poker",
        summary: "Log buy-ins, cash-outs, and session P/L — private to you.",
      },
    ],
  },
  {
    category: "Accounts",
    tabs: [
      {
        id: "cashAccounts",
        label: "Cash Accounts",
        href: "/cash-accounts",
        summary: "Net worth breakdown and personal bank accounts, e-wallets, and cash jars.",
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
      {
        id: "debt",
        label: "Debts & Loans",
        href: "/debt",
        summary:
          "Instalment plans and card balances — feeds cashflow, calendar, and burn-down charts.",
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
          "Salary, non-ILP insurance, partner linking, and import/export settings.",
      },
    ],
  },
];

export const TRANSACTIONS_NAV: NavTab =
  NAV_GROUPS.flatMap((g) => g.tabs).find((t) => t.id === "transactions")!;

export const ALL_NAV_TABS = NAV_GROUPS.flatMap((g) => g.tabs);

export function navTabForPath(pathname: string): NavTab | undefined {
  if (pathname === "/transactions" || pathname.startsWith("/transactions?")) {
    return TRANSACTIONS_NAV;
  }
  const tab = ALL_NAV_TABS.find(
    (t) => pathname === t.href || pathname.startsWith(`${t.href}/`)
  );
  if (tab?.id === "poker" && pathname.startsWith("/poker/stats")) {
    return {
      ...tab,
      label: "Poker statistics",
      summary: "Bankroll overview, trends, sessions, locations, and charts.",
    };
  }
  return tab;
}
