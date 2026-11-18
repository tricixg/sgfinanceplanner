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

/**
 * Domains each route needs, by path prefix (longest match wins). Step 1 of PERF-003: every route
 * still asks for everything, so behaviour is unchanged until each entry is narrowed with
 * evidence of what the page actually reads.
 */
const ROUTE_DOMAINS: Readonly<Record<string, readonly DataDomain[]>> = {};

export function domainsForPath(pathname: string | null | undefined): readonly DataDomain[] {
  if (!pathname) return ALL_DOMAINS;
  let best: string | null = null;
  for (const prefix of Object.keys(ROUTE_DOMAINS)) {
    const match = pathname === prefix || pathname.startsWith(`${prefix}/`);
    if (match && (best === null || prefix.length > best.length)) best = prefix;
  }
  return best === null ? ALL_DOMAINS : ROUTE_DOMAINS[best]!;
}

/** Test hook: the table, so a test can check every nav route has an entry. */
export function routeDomainTable(): Readonly<Record<string, readonly DataDomain[]>> {
  return ROUTE_DOMAINS;
}
