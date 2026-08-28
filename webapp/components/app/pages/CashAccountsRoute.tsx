"use client";

import { useEffect } from "react";
import { DomainPage } from "@/components/app/DomainPage";
import { TabCashAccounts } from "@/components/tabs/TabCashAccounts";
import { useAppSession } from "@/contexts/AppSessionContext";
import { useAppData } from "@/hooks/useAppData";
import { usePageSavings } from "@/hooks/usePageSavings";
import { useCardStatements } from "@/hooks/useCardStatements";

function CashAccountsContent({
  state,
  setState,
}: {
  state: Parameters<typeof TabCashAccounts>[0]["state"];
  setState: Parameters<typeof TabCashAccounts>[0]["setState"];
}) {
  const user = useAppSession();
  const { savingsTotals, savingsApi, accountsApi } = usePageSavings(user?.id, state);
  const { netWorthHistory, appendNetWorthSnapshot } = useAppData();
  const { bundle: cardStatementsBundle } = useCardStatements(Boolean(user?.id));

  // Depend on the *stable* members (reload is a useCallback, configured is a
  // boolean) — not the whole accountsApi object, which is a fresh identity every
  // render and would make this effect re-run → reload → re-render → loop.
  const { reload: reloadAccounts, configured: accountsConfigured } = accountsApi;
  useEffect(() => {
    if (!user?.id || !accountsConfigured) return;
    console.info("[CashAccountsRoute] refresh accounts on tab enter");
    void reloadAccounts();
  }, [user?.id, accountsConfigured, reloadAccounts]);

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
      netWorthApi={{ history: netWorthHistory, appendSnapshot: appendNetWorthSnapshot }}
      openCycles={cardStatementsBundle.openCycles}
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
