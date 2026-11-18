"use client";

import { useEffect, useRef } from "react";
import { DomainPage } from "@/components/app/DomainPage";
import { TabCashAccounts } from "@/components/tabs/TabCashAccounts";
import { useAppSession } from "@/contexts/AppSessionContext";
import { useAppData } from "@/hooks/useAppData";
import { usePageSavings } from "@/hooks/usePageSavings";
import { useCardStatements } from "@/hooks/useCardStatements";

function CashAccountsContent({
  state,
  setState,
  cardStatementsBundle,
  cardStatementsLoading,
}: {
  state: Parameters<typeof TabCashAccounts>[0]["state"];
  setState: Parameters<typeof TabCashAccounts>[0]["setState"];
  cardStatementsBundle: ReturnType<typeof useCardStatements>["bundle"];
  cardStatementsLoading: boolean;
}) {
  const user = useAppSession();
  const { savingsTotals, savingsApi, accountsApi, fundsApi } = usePageSavings(user?.id, state);
  const { netWorthHistory, appendNetWorthSnapshot } = useAppData();

  // Refresh once when entering the page, but only if the accounts were already cached from
  // an earlier page (so they may be stale). On a first visit the provider's own load is
  // already in flight; reloading when it completes would just fetch /api/accounts twice.
  // Depend on the *stable* members (reload is a useCallback) — not the whole accountsApi
  // object, which is a fresh identity every render.
  const { reload: reloadAccounts, configured: accountsConfigured } = accountsApi;
  const cachedOnEnterRef = useRef(accountsConfigured);
  const refreshedOnEnterRef = useRef(false);
  useEffect(() => {
    if (!user?.id || refreshedOnEnterRef.current) return;
    refreshedOnEnterRef.current = true;
    if (!cachedOnEnterRef.current) return;
    console.info("[CashAccountsRoute] refresh accounts on tab enter");
    void reloadAccounts();
  }, [user?.id, reloadAccounts]);

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
      snapshotInputs={{
        accountsLoaded:
          accountsApi.configured &&
          !accountsApi.loading &&
          !accountsApi.loadError &&
          accountsApi.totals != null,
        fundsLoaded: fundsApi.configured && !fundsApi.loading,
        // A failed statements load resets the bundle to configured:false.
        cardStatementsLoaded: cardStatementsBundle.configured && !cardStatementsLoading,
      }}
    />
  );
}

export function CashAccountsRoute() {
  const user = useAppSession();
  // Fetched here, not in CashAccountsContent, so the request starts on route entry instead of
  // after the core data has loaded. The net-worth snapshot still waits for it (snapshotInputs).
  const { bundle: cardStatementsBundle, loading: cardStatementsLoading } = useCardStatements(
    Boolean(user?.id)
  );
  return (
    <DomainPage>
      {({ state, setState, loading }) =>
        loading ? (
          <p className="loading">Loading your financial data…</p>
        ) : (
          <CashAccountsContent
            state={state}
            setState={setState}
            cardStatementsBundle={cardStatementsBundle}
            cardStatementsLoading={cardStatementsLoading}
          />
        )
      }
    </DomainPage>
  );
}
