export type AppRouteId =
  | "dashboard"
  | "health"
  | "thisMonth"
  | "thisMonthCashflow"
  | "cashAccounts"
  | "budget"
  | "savings"
  | "expenses"
  | "pastCashflow"
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
  | "miles"
  | "benefits"
  | "oncall"
  | "me";

/** Icon names resolve to `components/ui/Icon.tsx`. */
export type NavIcon =
  | "home"
  | "pulse"
  | "calendar"
  | "flow"
  | "wallet"
  | "bars"
  | "target"
  | "trend"
  | "growth"
  | "building"
  | "receipt"
  | "repeat"
  | "list"
  | "plane"
  | "star"
  | "spade"
  | "gift"
  | "clock"
  | "bank"
  | "card"
  | "pie"
  | "shield"
  | "coins"
  | "user";

export type NavTab = {
  id: AppRouteId;
  label: string;
  summary: string;
  href: string;
  icon: NavIcon;
};

/** Landing page after sign-in. */
export const HOME_HREF = "/dashboard";

export const NAV_GROUPS: { category: string; tabs: NavTab[] }[] = [
  {
    category: "Overview",
    tabs: [
      {
        id: "dashboard",
        label: "Dashboard",
        href: "/dashboard",
        icon: "home",
        summary: "Income, spending and cash flow at a glance.",
      },
      {
        id: "health",
        label: "Financial Health",
        href: "/financial-health",
        icon: "pulse",
        summary: "Net worth, resilience, commitments and progress towards your goals.",
      },
      {
        id: "thisMonth",
        label: "This Month",
        href: "/this-month",
        icon: "calendar",
        summary: "Monthly calendar, statement totals, and upcoming events.",
      },
      {
        id: "thisMonthCashflow",
        label: "This Month Cashflow",
        href: "/this-month-cashflow",
        icon: "flow",
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
        icon: "wallet",
        summary:
          "Take-home pay vs budget categories; loans and insurance auto-linked from other tabs.",
      },
      {
        id: "pastCashflow",
        label: "Past Cashflow",
        href: "/past-cashflow",
        icon: "bars",
        summary:
          "Five-month spending and income trends by category, card, and account.",
      },
      {
        id: "savings",
        label: "Savings & Goals",
        href: "/savings",
        icon: "target",
        summary:
          "Personal and shared savings accounts, goals, and progress (separate from budget).",
      },
      {
        id: "now",
        label: "5-Month Cashflow",
        href: "/now",
        icon: "trend",
        summary:
          "Five-month income vs fixed spend, loans, insurance, and where surplus goes.",
      },
      {
        id: "year",
        label: "5-Year Projection",
        href: "/year",
        icon: "growth",
        summary:
          "Wealth growth scenarios using budget, CPF, and investment assumptions.",
      },
      {
        id: "bto",
        label: "BTO Planner",
        href: "/bto",
        icon: "building",
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
        icon: "receipt",
        summary: "Log spending and track each budget category for the month.",
      },
      {
        id: "recurring",
        label: "Recurring",
        href: "/recurring",
        icon: "repeat",
        summary:
          "Monthly debt, insurance, ILP, and subscription payments — mark paid and track pay-from account.",
      },
      {
        id: "transactions",
        label: "Transaction history",
        href: "/transactions",
        icon: "list",
        summary: "Unified savings, budget, and expense transaction history.",
      },
      {
        id: "travel",
        label: "Travel",
        href: "/travel",
        icon: "plane",
        summary: "Trip budgets and actual travel spending by category.",
      },
      {
        id: "miles",
        label: "Miles Tracker",
        href: "/miles",
        icon: "star",
        summary:
          "KrisFlyer miles and card points by expiry: when to convert each card and when to redeem.",
      },
      {
        id: "poker",
        label: "Poker tracker",
        href: "/poker",
        icon: "spade",
        summary: "Log buy-ins, cash-outs, and session P/L — private to you.",
      },
      {
        id: "benefits",
        label: "Benefits",
        href: "/benefits",
        icon: "gift",
        summary:
          "Work/insurance benefit limits — dental, specialist medical, WFH allowance — with per-cycle or one-time utilization tracking.",
      },
      {
        id: "oncall",
        label: "On-call tracker",
        href: "/oncall",
        icon: "clock",
        summary:
          "On-call days, extra take-home and CPF — record payslip payments into On-call allowance income.",
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
        icon: "bank",
        summary: "Net worth breakdown and personal bank accounts, e-wallets, and cash jars.",
      },
      {
        id: "cards",
        label: "Credit Cards",
        href: "/cards",
        icon: "card",
        summary:
          "Singapore card catalog, rewards snapshot, and spend advisor for which card to use.",
      },
      {
        id: "wealth",
        label: "Investment",
        href: "/wealth",
        icon: "pie",
        summary: "Holdings with live prices and P&L, plus Manulife-style ILP policies.",
      },
      {
        id: "cpf",
        label: "CPF Outlook",
        href: "/cpf",
        icon: "shield",
        summary:
          "OA, SA, and MediSave balances for BTO planning, net worth, and long-term projections.",
      },
      {
        id: "debt",
        label: "Debts & Loans",
        href: "/debt",
        icon: "coins",
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
        label: "Me",
        href: "/me",
        icon: "user",
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
  if (tab?.id === "bto" && pathname.startsWith("/bto/price-finder")) {
    return {
      ...tab,
      label: "BTO price finder",
      summary: "Which flat prices your CPF OA, salaries, and savings can cover.",
    };
  }
  if (tab?.id === "poker" && pathname.startsWith("/poker/stats")) {
    return {
      ...tab,
      label: "Poker statistics",
      summary: "Bankroll overview, trends, sessions, locations, and charts.",
    };
  }
  return tab;
}
