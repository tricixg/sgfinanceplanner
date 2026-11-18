/**
 * The session-cached data domains behind AppDataContext, and which ones each route needs.
 *
 * A page only loads the domains it uses (PERF-003). Two safety nets keep a mistake in the table
 * below from ever showing empty data as if it were real:
 *  - reading a field of a domain nobody requested loads that domain (see useAppData), and
 *  - whole-list saves refuse to run unless their domain finished loading.
 * Routes missing from the table load everything.
 */

export const DATA_DOMAINS = [
  "prefs",
  "profile",
  "loans",
  "otherLoans",
  "budget",
  "cards",
  "holdings",
  "snapshots",
  "netWorth",
  "cpfContributions",
  "cpfTransactions",
] as const;

export type DataDomain = (typeof DATA_DOMAINS)[number];

/** A page's content waits for the core domains it needs. */
export const CORE_DOMAINS: readonly DataDomain[] = [
  "prefs",
  "profile",
  "loans",
  "otherLoans",
  "budget",
  "cards",
  "holdings",
];

/** Loaded alongside, never waited for: pages show placeholders while these arrive. */
export const SECONDARY_DOMAINS: readonly DataDomain[] = [
  "snapshots",
  "netWorth",
  "cpfContributions",
  "cpfTransactions",
];

export const ALL_DOMAINS: readonly DataDomain[] = DATA_DOMAINS;

export type DomainStatus = "idle" | "loading" | "ready" | "error";

/** Done loading, successfully or not (a failure is shown per section and blocks editing). */
export function isSettled(status: DomainStatus): boolean {
  return status === "ready" || status === "error";
}

export const DOMAIN_LABEL: Record<DataDomain, string> = {
  prefs: "Preferences",
  profile: "Your profile",
  loans: "Instalment plans",
  otherLoans: "Personal and balance-transfer loans",
  budget: "Budget",
  cards: "Credit cards",
  holdings: "Holdings",
  snapshots: "Portfolio history",
  netWorth: "Net worth history",
  cpfContributions: "CPF contributions",
  cpfTransactions: "CPF transactions",
};

/** Which domain fills each field of the composed DashboardState. Others are domain-free defaults. */
export const STATE_FIELD_DOMAIN: Readonly<Record<string, DataDomain>> = {
  prefs: "prefs",
  monthlySal: "profile",
  salaryCreditDay: "profile",
  dateOfBirth: "profile",
  oa: "profile",
  sa: "profile",
  ma: "profile",
  moo: "profile",
  margin: "profile",
  cash: "profile",
  ccDebt: "profile",
  cashflowStartYm: "profile",
  btoPlanner: "profile",
  milesPlanner: "profile",
  insurancePolicies: "profile",
  ilpPolicies: "profile",
  loans: "loans",
  otherLoans: "otherLoans",
  budget: "budget",
  budgetMonths: "budget",
  incomeMonths: "budget",
  computedMonths: "budget",
  creditCards: "cards",
  holdings: "holdings",
  portfolioHistory: "snapshots",
};

/** Same, for the fields AppDataContext exposes next to `state`. */
export const CONTEXT_FIELD_DOMAIN: Readonly<Record<string, DataDomain>> = {
  netWorthHistory: "netWorth",
  cpfContributions: "cpfContributions",
  cpfTransactions: "cpfTransactions",
  cardsApi: "cards",
};

const CORE_AND_NET_WORTH: readonly DataDomain[] = [...CORE_DOMAINS, "netWorth"];

/**
 * Domains each route needs, matched on the exact path. Derived from what each page actually
 * reads, recorded in a browser with every domain undeclared and the read guard on
 * (documentation/audit/perf-harness/domain-reads.js, results in domain-reads.json), plus a read of
 * each page's components for reads the probe cannot reach (inside click handlers or loops over
 * rows). The two safety nets above cover whatever that still misses.
 *
 * Paths not listed (dynamic children such as /travel/<id>, anything new) load every domain.
 * An empty list means the page reads no shared session data and fetches its own.
 */
const ROUTE_DOMAINS: Readonly<Record<string, readonly DataDomain[]>> = {
  "/dashboard": ["profile"],
  "/financial-health": ["profile", "loans", "otherLoans", "budget", "cards", "holdings", "netWorth"],
  "/this-month": ["profile", "loans", "otherLoans", "cards"],
  "/this-month-cashflow": ["profile", "loans", "otherLoans", "budget", "cards"],
  "/budget": ["prefs", "profile", "loans", "otherLoans", "budget", "cards", "holdings", "snapshots"],
  "/past-cashflow": [],
  "/savings": [],
  "/now": ["profile", "loans", "otherLoans", "budget", "cards"],
  "/year": ["profile", "loans", "otherLoans", "budget", "cards", "holdings"],
  "/bto": ["profile", "loans", "otherLoans", "cards", "cpfContributions", "cpfTransactions"],
  "/bto/price-finder": ["profile", "loans", "otherLoans", "cards", "cpfContributions", "cpfTransactions"],
  "/expenses": [],
  "/recurring": ["budget"],
  "/transactions": [],
  "/travel": ["cards"],
  "/miles": ["profile", "cards"],
  "/poker": [],
  "/poker/stats": [],
  "/benefits": [],
  "/oncall": [],
  // The monthly net-worth snapshot is written from here and must only be written from fully
  // loaded data (lib/net-worth/snapshot-gate.ts), so this page declares every core domain.
  "/cash-accounts": CORE_AND_NET_WORTH,
  "/cards": ["cards"],
  "/wealth": ["prefs", "profile", "loans", "otherLoans", "budget", "cards", "holdings", "snapshots"],
  "/cpf": ["profile", "cards", "cpfContributions", "cpfTransactions"],
  "/debt": ["profile", "loans", "otherLoans", "cards"],
  "/me": ["prefs", "profile", "loans", "otherLoans", "budget", "cards", "holdings", "snapshots"],
};

export function domainsForPath(pathname: string | null | undefined): readonly DataDomain[] {
  if (!pathname) return ALL_DOMAINS;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return ROUTE_DOMAINS[path] ?? ALL_DOMAINS;
}

/** Test hook: the table, so tests can check it against the nav and the recorded reads. */
export function routeDomainTable(): Readonly<Record<string, readonly DataDomain[]>> {
  return ROUTE_DOMAINS;
}
