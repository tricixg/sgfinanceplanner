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
  const { savingsTotals } = usePageSavings(user?.id, state);
  return (
    <TabWealth
      state={state}
      setState={setState}
      savings={savingsTotals}
      snapshotsLoading={snapshotsLoading}
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
