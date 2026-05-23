"use client";

import { DomainPage } from "@/components/app/DomainPage";
import { TabThisMonth } from "@/components/tabs/TabThisMonth";
import { useAppSession } from "@/contexts/AppSessionContext";
import { usePageSavings } from "@/hooks/usePageSavings";

function ThisMonthContent({
  state,
  setState,
}: {
  state: Parameters<typeof TabThisMonth>[0]["state"];
  setState: Parameters<typeof TabThisMonth>[0]["setState"];
}) {
  const user = useAppSession();
  const { savingsTotals } = usePageSavings(user?.id, state);
  return <TabThisMonth state={state} setState={setState} savings={savingsTotals} />;
}

export function ThisMonthRoute() {
  return (
    <DomainPage>
      {({ state, setState }) => (
        <ThisMonthContent state={state} setState={setState} />
      )}
    </DomainPage>
  );
}
