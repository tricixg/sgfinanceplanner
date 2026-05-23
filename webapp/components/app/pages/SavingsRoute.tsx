"use client";

import { TabSavings } from "@/components/tabs/TabSavings";
import { useAppSession } from "@/contexts/AppSessionContext";
import { usePageSavings } from "@/hooks/usePageSavings";
import { createEmptyState } from "@/lib/finance/defaults";

export function SavingsRoute() {
  const user = useAppSession();
  const { savingsApi, accountsApi } = usePageSavings(user?.id, createEmptyState());

  if (!user?.id) {
    return <p className="note">Sign in to manage savings.</p>;
  }

  return (
    <TabSavings
      savings={savingsApi.bundle}
      configured={savingsApi.configured}
      personalAccounts={accountsApi.configured ? accountsApi.accounts : []}
      savePools={savingsApi.savePools}
      saveGoals={savingsApi.saveGoals}
      recordPoolTransaction={savingsApi.recordPoolTransaction}
    />
  );
}
