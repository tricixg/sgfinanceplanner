import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { totalStatementAmount } from "@/lib/finance/calendar";
import { netWorthTotal } from "@/lib/finance";
import { loadCreditCards } from "@/lib/credit-cards/load";
import { loadFinanceProfile } from "@/lib/profile/load";
import { loadHoldings } from "@/lib/holdings/load";
import { loadSavingsBundle, mergeSavingsSnapshots } from "@/lib/savings/load-bundle";
import { loadAccountsBundle } from "@/lib/savings/load-accounts";
import { loadFundsBundle } from "@/lib/funds/load";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { mergeWithDefaults, createEmptyState } from "@/lib/finance/defaults";
import type { DashboardState } from "@/lib/types";

/**
 * Lightweight overview for /this-month without loading every domain on the client.
 */
export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  try {
    const supabase = await createAuthedSupabaseClient();
    const userId = auth.user.id;

    const started = Date.now();
    const [profile, cards, holdings, accountsBundle, savingsBundle, fundsBundle] =
      await Promise.all([
        loadFinanceProfile(supabase, userId),
        loadCreditCards(supabase, userId),
        loadHoldings(supabase, userId),
        loadAccountsBundle(supabase, userId),
        loadSavingsBundle(supabase, userId, []),
        loadFundsBundle(supabase, userId),
      ]);
    const savingsTotals = mergeSavingsSnapshots(
      accountsBundle.totals,
      savingsBundle,
      fundsBundle.totals.fundsBalanceTotal
    );

    const state = mergeWithDefaults({
      ...createEmptyState(),
      ...profile,
      creditCards: cards,
      holdings,
    } as Partial<DashboardState>);

    const stmtTotal = totalStatementAmount(state);
    const netWorth = netWorthTotal(state, false, savingsTotals);
    const netWorthWithCpf = netWorthTotal(state, true, savingsTotals);

    console.info("[api/summary] GET ok", {
      userId,
      loadMs: Date.now() - started,
    });

    return NextResponse.json({
      configured: true,
      statementTotal: stmtTotal,
      netWorth,
      netWorthWithCpf,
      monthlySal: profile.monthlySal,
      cardCount: cards.length,
      holdingsCount: holdings.length,
      personalSavingsCash: savingsTotals?.personalSavingsCash ?? 0,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load summary";
    console.error("[api/summary] GET failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
