import type { SupabaseClient } from "@supabase/supabase-js";
import type { DashboardState } from "@/lib/types";
import type { SavingsSnapshot } from "@/lib/savings/types";
import { createEmptyState, mergeWithDefaults } from "@/lib/finance/defaults";
import { wealthSummary } from "@/lib/finance/wealth";
import { liveComputedLines } from "@/lib/finance/computed-months";
import { loadCreditCards } from "@/lib/credit-cards/load";
import { loadCardStatementsBundle } from "@/lib/credit-cards/card-statements/load";
import { loadFinanceProfile, loadIlpPolicies, loadInsurancePolicies } from "@/lib/profile/load";
import { loadHoldings } from "@/lib/holdings/load";
import { loadAccountsBundle } from "@/lib/savings/load-accounts";
import { loadFundsBundle } from "@/lib/funds/load";
import { loadLoans } from "@/lib/loans/load";
import { loadOtherLoans } from "@/lib/other-loans/load";
import { appendNetWorthSnapshot } from "@/lib/net-worth/load";
import { saveComputedMonth } from "@/lib/budget/computed-months-load";
import { fetchAllRows } from "@/lib/supabase/fetch-all";

/** Days in a month (month is 1–12), no local-timezone dependence. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Which month the job is for and whether `todayYmd` (SGT) is its last day. */
export function monthEndInfo(todayYmd: string): { ym: string; isLastDay: boolean } {
  const [y, m, d] = todayYmd.split("-").map(Number);
  return {
    ym: todayYmd.slice(0, 7),
    isLastDay: d === daysInMonth(y, m),
  };
}

/** Everything the month-end figures are computed from, loaded for one user. */
export async function loadUserFinanceState(supabase: SupabaseClient, userId: string) {
  const [profile, insurancePolicies, ilpPolicies, cards, holdings, accountsBundle, fundsBundle, loans, otherLoans] =
    await Promise.all([
      loadFinanceProfile(supabase, userId),
      loadInsurancePolicies(supabase, userId),
      loadIlpPolicies(supabase, userId),
      loadCreditCards(supabase, userId),
      loadHoldings(supabase, userId),
      loadAccountsBundle(supabase, userId),
      loadFundsBundle(supabase, userId),
      loadLoans(supabase, userId),
      loadOtherLoans(supabase, userId),
    ]);

  const state = mergeWithDefaults({
    ...createEmptyState(),
    ...profile,
    insurancePolicies,
    ilpPolicies,
    creditCards: cards,
    holdings,
    loans,
    otherLoans,
  } as Partial<DashboardState>);

  // Same personal-only savings view the Cash Accounts page stores: personal
  // accounts and funds, joint money zeroed.
  const t = accountsBundle.totals;
  const savings: SavingsSnapshot = {
    personalSavingsCash: t.personalSavingsCash,
    personalNetWorthCash: t.personalNetWorthCash,
    personalCash: t.personalSavingsCash,
    jointCash: 0,
    jointSavingsCash: 0,
    jointNetWorthCash: 0,
    personalMonthlySave: 0,
    jointMonthlySave: 0,
    personalFundsValue: fundsBundle.totals.fundsBalanceTotal,
  };

  // Open card cycles feed the card-balance liability. Needs the cards loaded first.
  const cardBundle = await loadCardStatementsBundle(supabase, userId, cards);
  return { state, savings, openCycles: cardBundle.openCycles };
}

export type UserMonthEndResult = { netWorth: boolean; lines: boolean; errors: string[] };

/**
 * Month-end work for one user: record the month's net-worth snapshot and
 * freeze the month's insurance / ILP / loan figures. Nothing is written from
 * partial data: if any input fails to load, neither is written for this user.
 */
export async function processUserMonthEnd(
  supabase: SupabaseClient,
  userId: string,
  ym: string
): Promise<UserMonthEndResult> {
  const result: UserMonthEndResult = { netWorth: false, lines: false, errors: [] };
  let loaded: Awaited<ReturnType<typeof loadUserFinanceState>>;
  try {
    loaded = await loadUserFinanceState(supabase, userId);
  } catch (e) {
    result.errors.push(`load: ${e instanceof Error ? e.message : String(e)}`);
    return result;
  }
  const { state, savings, openCycles } = loaded;

  try {
    const { lnw, cpf } = wealthSummary(state, savings, openCycles);
    if (!Number.isFinite(lnw) || !Number.isFinite(cpf)) throw new Error("non-finite net worth");
    await appendNetWorthSnapshot(supabase, userId, { month: `${ym}-01`, lnw, cpf });
    result.netWorth = true;
  } catch (e) {
    result.errors.push(`net worth: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    await saveComputedMonth(supabase, userId, ym, liveComputedLines(state, ym));
    result.lines = true;
  } catch (e) {
    result.errors.push(`computed lines: ${e instanceof Error ? e.message : String(e)}`);
  }
  return result;
}

/** Every user with a finance profile. */
export async function listProfileUserIds(supabase: SupabaseClient): Promise<string[]> {
  const rows = await fetchAllRows<{ user_id: unknown }>((from, to) =>
    supabase.from("user_finance_profile").select("user_id").order("user_id").range(from, to)
  );
  return rows.map((r) => String(r.user_id));
}

export type MonthEndSummary = {
  month: string;
  users: number;
  netWorthWritten: number;
  linesFrozen: number;
  failedUsers: number;
};

/** Runs `processUser` for every user with limited concurrency; one user's failure never stops the rest. */
export async function runMonthEnd(opts: {
  userIds: string[];
  ym: string;
  processUser: (userId: string, ym: string) => Promise<UserMonthEndResult>;
  concurrency?: number;
}): Promise<MonthEndSummary> {
  const { userIds, ym, processUser, concurrency = 3 } = opts;
  const summary: MonthEndSummary = {
    month: ym,
    users: userIds.length,
    netWorthWritten: 0,
    linesFrozen: 0,
    failedUsers: 0,
  };
  let next = 0;
  const worker = async () => {
    while (next < userIds.length) {
      const userId = userIds[next++]!;
      try {
        const r = await processUser(userId, ym);
        if (r.netWorth) summary.netWorthWritten++;
        if (r.lines) summary.linesFrozen++;
        if (r.errors.length > 0) {
          summary.failedUsers++;
          console.error("[cron/month-end] user had errors", { userId, errors: r.errors });
        }
      } catch (e) {
        summary.failedUsers++;
        console.error("[cron/month-end] user failed", {
          userId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return summary;
}
