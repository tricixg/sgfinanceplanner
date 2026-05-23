"use client";

import { useMemo } from "react";
import type { DashboardState } from "@/lib/types";
import { useSavings } from "@/hooks/useSavings";
import { useAccounts } from "@/hooks/useAccounts";
import { mergeSavingsSnapshots } from "@/lib/savings/load-bundle";
import { buildSavingsSnapshot } from "@/lib/finance/savings-totals";
import { localAccountsAsUserSavings, localAccountTotals } from "@/lib/finance/accounts";
import type { SavingsSnapshot } from "@/lib/savings/types";

/** Savings totals for chart/overview tabs — only when userId is set. */
export function usePageSavings(userId: string | undefined, state: DashboardState) {
  const savingsApi = useSavings(Boolean(userId));
  const accountsApi = useAccounts(Boolean(userId));

  const savingsTotals = useMemo((): SavingsSnapshot | null => {
    if (accountsApi.configured && accountsApi.totals && savingsApi.configured) {
      return mergeSavingsSnapshots(accountsApi.totals, savingsApi.bundle);
    }
    if (accountsApi.configured && accountsApi.totals) {
      const t = accountsApi.totals;
      return {
        personalSavingsCash: t.personalSavingsCash,
        personalNetWorthCash: t.personalNetWorthCash,
        personalCash: t.personalSavingsCash,
        jointCash: 0,
        jointSavingsCash: 0,
        jointNetWorthCash: 0,
        personalMonthlySave: 0,
        jointMonthlySave: 0,
      };
    }
    const accounts = localAccountsAsUserSavings(state);
    const local = localAccountTotals(state);
    if (savingsApi.configured) {
      if (accounts.length > 0) {
        return mergeSavingsSnapshots(local, savingsApi.bundle);
      }
      return savingsApi.bundle.totals;
    }
    if (accounts.length === 0) return null;
    return buildSavingsSnapshot(accounts, [], []);
  }, [
    accountsApi.configured,
    accountsApi.totals,
    savingsApi.configured,
    savingsApi.bundle,
    state,
  ]);

  return { savingsTotals, savingsApi, accountsApi };
}
