"use client";

import { useEffect } from "react";
import { DomainPage } from "@/components/app/DomainPage";
import { TabCashAccounts } from "@/components/tabs/TabCashAccounts";
import { useAppSession } from "@/contexts/AppSessionContext";
import { usePageSavings } from "@/hooks/usePageSavings";

function CashAccountsContent({
  state,
  setState,
}: {
  state: Parameters<typeof TabCashAccounts>[0]["state"];
  setState: Parameters<typeof TabCashAccounts>[0]["setState"];
}) {
  const user = useAppSession();
  const { savingsTotals, savingsApi, accountsApi } = usePageSavings(user?.id, state);

  useEffect(() => {
    if (!user?.id || !accountsApi.configured) return;
    console.info("[CashAccountsRoute] refresh accounts on tab enter");
    void accountsApi.reload();
  }, [user?.id, accountsApi.configured, accountsApi.reload]);

  return (
    <TabCashAccounts
      state={state}
      setState={setState}
      savings={savingsTotals}
      accountsApi={
        accountsApi.configured
          ? {
              accounts: accountsApi.accounts,
              totals: accountsApi.totals,
              saveAccounts: accountsApi.saveAccounts,
              recordAccountTransaction: accountsApi.recordAccountTransaction,
              reload: accountsApi.reload,
            }
          : undefined
      }
      savingsGoals={savingsApi.configured ? savingsApi.bundle.goals : undefined}
    />
  );
}

export function CashAccountsRoute() {
  return (
    <DomainPage>
      {({ state, setState }) => (
        <CashAccountsContent state={state} setState={setState} />
      )}
    </DomainPage>
  );
}
