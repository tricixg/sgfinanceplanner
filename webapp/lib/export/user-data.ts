import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Full server-side export of everything the signed-in user owns (BKP-001).
 *
 * Unlike the dashboard-state JSON on the Me page (in-memory only), this reads
 * every user table from the database. It is a data export for safekeeping —
 * there is no matching import. Deliberately excluded: Telegram link codes and
 * links (secrets / chat ids) and the Supabase auth record.
 */

export const EXPORT_FORMAT_VERSION = 1;
const PAGE = 1000;

type UserTable = { table: string; orderBy?: string };

/** Tables whose rows carry `user_id` (every table except the household/Telegram ones below). */
export const USER_TABLES: UserTable[] = [
  { table: "dashboard_state", orderBy: "user_id" },
  { table: "user_finance_profile", orderBy: "user_id" },
  { table: "budget_months", orderBy: "user_id" },
  { table: "budget_line_months", orderBy: "id" },
  { table: "budget_lines", orderBy: "id" },
  { table: "budget_transactions", orderBy: "id" },
  { table: "expenses", orderBy: "id" },
  { table: "income_categories", orderBy: "id" },
  { table: "user_savings_accounts", orderBy: "id" },
  { table: "financial_accounts", orderBy: "id" },
  { table: "credit_cards", orderBy: "id" },
  { table: "card_statements", orderBy: "id" },
  { table: "card_statement_credits", orderBy: "id" },
  { table: "loans", orderBy: "id" },
  { table: "other_loans", orderBy: "id" },
  { table: "bnpl_plans", orderBy: "id" },
  { table: "holdings", orderBy: "id" },
  { table: "holding_dividends", orderBy: "id" },
  { table: "portfolio_snapshots", orderBy: "id" },
  { table: "net_worth_snapshots", orderBy: "id" },
  { table: "investment_funds", orderBy: "id" },
  { table: "fund_transactions", orderBy: "id" },
  { table: "recurring_investments", orderBy: "id" },
  { table: "recurring_subscriptions", orderBy: "id" },
  { table: "insurance_policies", orderBy: "id" },
  { table: "ilp_policies", orderBy: "id" },
  { table: "cpf_contributions", orderBy: "id" },
  { table: "cpf_transactions", orderBy: "id" },
  { table: "miles_balances", orderBy: "id" },
  { table: "benefits", orderBy: "id" },
  { table: "benefit_claims", orderBy: "id" },
  { table: "oncall_settings", orderBy: "user_id" },
  { table: "oncall_entries", orderBy: "id" },
  { table: "oncall_payments", orderBy: "id" },
  { table: "oncall_payment_items", orderBy: "id" },
  { table: "poker_sessions", orderBy: "id" },
  { table: "poker_locations", orderBy: "id" },
  { table: "poker_games", orderBy: "id" },
  { table: "travel_trips", orderBy: "id" },
  { table: "travel_trip_budgets", orderBy: "id" },
  { table: "travel_trip_companions", orderBy: "id" },
  { table: "travel_expense_splits" },
  { table: "travel_expense_split_shares", orderBy: "id" },
  { table: "travel_companion_settlements", orderBy: "id" },
];

/** Tables intentionally left out of the export (secrets / dropped). */
export const EXPORT_EXCLUDED_TABLES = [
  "telegram_link_codes",
  "telegram_links",
  "telegram_conversations",
  "dashboard_state_legacy",
];

/** Household-scoped tables that are exported when the user belongs to a household. */
export const HOUSEHOLD_EXPORT_TABLES = [
  "households",
  "household_members",
  "savings_pools",
  "savings_goals",
  "savings_transactions",
  "household_bto_planner",
  "partner_invites",
];

type Filter = (q: FilterBuilder) => FilterBuilder;
// Minimal structural type for the PostgREST filter builder methods we use.
type FilterBuilder = {
  eq: (col: string, val: string) => FilterBuilder;
  or: (expr: string) => FilterBuilder;
};

type ScopedTable = { table: string; orderBy?: string; filter: Filter };

function householdTables(userId: string, householdId: string, email: string): ScopedTable[] {
  return [
    { table: "households", orderBy: "id", filter: (q) => q.eq("id", householdId) },
    { table: "household_members", filter: (q) => q.eq("household_id", householdId) },
    { table: "savings_pools", orderBy: "id", filter: (q) => q.eq("household_id", householdId) },
    {
      table: "savings_goals",
      orderBy: "id",
      filter: (q) => q.or(`owner_user_id.eq.${userId},household_id.eq.${householdId}`),
    },
    {
      // Includes the partner's entries on shared pools (they are part of your joint ledger).
      table: "savings_transactions",
      orderBy: "id",
      filter: (q) => q.or(`user_id.eq.${userId},household_id.eq.${householdId}`),
    },
    { table: "household_bto_planner", filter: (q) => q.eq("household_id", householdId) },
    { table: "partner_invites", orderBy: "id", filter: (q) => q.eq("household_id", householdId) },
    ...(email
      ? [
          {
            table: "partner_invites_received",
            orderBy: "id",
            filter: (q: FilterBuilder) => q.eq("invitee_email", email),
          },
        ]
      : []),
  ];
}

export type TableSummary = { rows: number; error?: string };
export type ExportSummary = {
  complete: boolean;
  tables: Record<string, TableSummary>;
  errors: Record<string, string>;
  totalRows: number;
};

async function fetchAll(
  supabase: SupabaseClient,
  sourceTable: string,
  orderBy: string | undefined,
  filter: Filter
): Promise<{ rows: unknown[]; error?: string }> {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(sourceTable).select("*") as unknown as FilterBuilder & {
      order: (c: string) => typeof q;
      range: (a: number, b: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
    };
    q = filter(q) as typeof q;
    const ordered = orderBy ? (q.order(orderBy) as typeof q) : q;
    const { data, error } = await ordered.range(from, from + PAGE - 1);
    if (error) return { rows, error: error.message };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return { rows };
}

/**
 * Yields the export as JSON text chunks (streamed so a large account doesn't
 * have to fit in one serverless response). The `summary` is written LAST and
 * says whether every table was read successfully.
 */
export async function* exportUserDataChunks(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null },
  now: Date = new Date()
): AsyncGenerator<string> {
  const email = (user.email ?? "").toLowerCase();
  const summary: ExportSummary = { complete: true, tables: {}, errors: {}, totalRows: 0 };

  yield `{"meta":${JSON.stringify({
    app: "sgfinanceplanner",
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    userId: user.id,
    email,
    note:
      "Full data export of your tables. It is a copy for safekeeping, not an importable backup. " +
      "Excludes Telegram link data. Check summary.complete at the end of this file.",
  })},"tables":{`;

  let first = true;
  const emit = async function* (name: string, result: { rows: unknown[]; error?: string }) {
    summary.tables[name] = { rows: result.rows.length, ...(result.error ? { error: result.error } : {}) };
    summary.totalRows += result.rows.length;
    if (result.error) {
      summary.complete = false;
      summary.errors[name] = result.error;
    }
    yield `${first ? "" : ","}${JSON.stringify(name)}:${JSON.stringify(result.rows)}`;
    first = false;
  };

  for (const t of USER_TABLES) {
    yield* emit(
      t.table,
      await fetchAll(supabase, t.table, t.orderBy, (q) => q.eq("user_id", user.id))
    );
  }

  // Household-scoped data: only if the user belongs to a household.
  const { data: membership, error: memErr } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .limit(1);
  if (memErr) {
    summary.complete = false;
    summary.errors["household_members"] = memErr.message;
  } else {
    const householdId = membership?.[0]?.household_id as string | undefined;
    if (householdId) {
      for (const t of householdTables(user.id, householdId, email)) {
        const source = t.table === "partner_invites_received" ? "partner_invites" : t.table;
        yield* emit(t.table, await fetchAll(supabase, source, t.orderBy, t.filter));
      }
    }
  }

  yield `},"summary":${JSON.stringify(summary)}}`;
}
