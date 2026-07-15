"use client";

import { useMemo } from "react";
import type { DashboardState } from "@/lib/types";
import { useSavings } from "@/hooks/useSavings";
import { useAccounts } from "@/hooks/useAccounts";
import { useFunds } from "@/hooks/useFunds";
import { mergeSavingsSnapshots } from "@/lib/savings/load-bundle";
import { buildSavingsSnapshot } from "@/lib/finance/savings-totals";
import { localAccountsAsUserSavings, localAccountTotals } from "@/lib/finance/accounts";
import type { SavingsSnapshot } from "@/lib/savings/types";

/** Savings totals for chart/overview tabs — reads session-cached savings data. */
export function usePageSavings(_userId: string | undefined, state: DashboardState) {
  const savingsApi = useSavings();
  const accountsApi = useAccounts();
  const fundsApi = useFunds();

  const fundsValue = fundsApi.configured ? fundsApi.totals?.fundsBalanceTotal ?? 0 : 0;

  const savingsTotals = useMemo((): SavingsSnapshot | null => {
    if (accountsApi.configured && accountsApi.totals && savingsApi.configured) {
      return mergeSavingsSnapshots(accountsApi.totals, savingsApi.bundle, fundsValue);
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
        personalFundsValue: fundsValue,
      };
    }
    const accounts = localAccountsAsUserSavings(state);
    const local = localAccountTotals(state);
    if (savingsApi.configured) {
      if (accounts.length > 0) {
        return mergeSavingsSnapshots(local, savingsApi.bundle, fundsValue);
      }
      return { ...savingsApi.bundle.totals, personalFundsValue: fundsValue };
    }
    if (accounts.length === 0) return null;
    return { ...buildSavingsSnapshot(accounts, [], []), personalFundsValue: fundsValue };
  }, [
    accountsApi.configured,
    accountsApi.totals,
    savingsApi.configured,
    savingsApi.bundle,
    fundsValue,
    state,
  ]);

  return { savingsTotals, savingsApi, accountsApi, fundsApi };
}
