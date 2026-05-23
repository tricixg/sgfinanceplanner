"use client";

import { TabSavings } from "@/components/tabs/TabSavings";
import { useAppSession } from "@/contexts/AppSessionContext";
import { usePageSavings } from "@/hooks/usePageSavings";
import { createEmptyState } from "@/lib/finance/defaults";

export function SavingsRoute() {
  const user = useAppSession();
  const { savingsApi, accountsApi } = usePageSavings(user?.id, createEmptyState());

  if (!user?.id || savingsApi.loading) {
    return <p className="loading">Loading your financial data…</p>;
  }

  return (
    <TabSavings
      savings={savingsApi.bundle}
      configured={savingsApi.configured}
      loading={savingsApi.loading}
      personalAccounts={accountsApi.configured ? accountsApi.accounts : []}
      savePools={savingsApi.savePools}
      saveGoals={savingsApi.saveGoals}
      recordPoolTransaction={savingsApi.recordPoolTransaction}
    />
  );
}
