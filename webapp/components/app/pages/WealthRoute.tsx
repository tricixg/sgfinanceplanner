"use client";

import { DomainPage } from "@/components/app/DomainPage";
import { TabWealth } from "@/components/tabs/TabWealth";
import { useAppSession } from "@/contexts/AppSessionContext";
import { usePageSavings } from "@/hooks/usePageSavings";

function WealthContent({
  state,
  setState,
  snapshotsLoading,
}: {
  state: Parameters<typeof TabWealth>[0]["state"];
  setState: Parameters<typeof TabWealth>[0]["setState"];
  snapshotsLoading: boolean;
}) {
  const user = useAppSession();
  const { savingsTotals, savingsApi, accountsApi, fundsApi } = usePageSavings(
    user?.id,
    state
  );
  return (
    <TabWealth
      state={state}
      setState={setState}
      savings={savingsTotals}
      snapshotsLoading={snapshotsLoading}
      fundsApi={
        fundsApi.configured
          ? {
              funds: fundsApi.funds,
              totals: fundsApi.totals,
              saveFunds: fundsApi.saveFunds,
              recordFundTransaction: fundsApi.recordFundTransaction,
              deleteFundTransaction: fundsApi.deleteFundTransaction,
            }
          : undefined
      }
      accountsApi={
        accountsApi.configured
          ? {
              accounts: accountsApi.accounts,
              recordAccountTransaction: accountsApi.recordAccountTransaction,
            }
          : undefined
      }
      savingsGoals={savingsApi.configured ? savingsApi.bundle.goals : undefined}
    />
  );
}

export function WealthRoute() {
  return (
    <DomainPage>
      {({ state, setState, snapshotsLoading }) => (
        <WealthContent
          state={state}
          setState={setState}
          snapshotsLoading={snapshotsLoading}
        />
      )}
    </DomainPage>
  );
}
