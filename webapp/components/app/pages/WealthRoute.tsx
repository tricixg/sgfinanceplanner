"use client";

import { DomainPage } from "@/components/app/DomainPage";
import { TabWealth } from "@/components/tabs/TabWealth";
import { useAppSession } from "@/contexts/AppSessionContext";
import { usePageSavings } from "@/hooks/usePageSavings";

function WealthContent({
  state,
  setState,
}: {
  state: Parameters<typeof TabWealth>[0]["state"];
  setState: Parameters<typeof TabWealth>[0]["setState"];
}) {
  const user = useAppSession();
  const { savingsTotals } = usePageSavings(user?.id, state);
  return (
    <TabWealth state={state} setState={setState} savings={savingsTotals} />
  );
}

export function WealthRoute() {
  return (
    <DomainPage>
      {({ state, setState }) => (
        <WealthContent state={state} setState={setState} />
      )}
    </DomainPage>
  );
}
