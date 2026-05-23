"use client";

import { DomainPage } from "@/components/app/DomainPage";
import { TabNow } from "@/components/tabs/TabNow";
import { useAppSession } from "@/contexts/AppSessionContext";
import { usePageSavings } from "@/hooks/usePageSavings";

function NowContent({
  state,
  setState,
}: {
  state: Parameters<typeof TabNow>[0]["state"];
  setState: Parameters<typeof TabNow>[0]["setState"];
}) {
  const user = useAppSession();
  const { savingsTotals } = usePageSavings(user?.id, state);
  return <TabNow state={state} setState={setState} savings={savingsTotals} authEnabled={Boolean(user)} />;
}

export function NowRoute() {
  return (
    <DomainPage>
      {({ state, setState }) => <NowContent state={state} setState={setState} />}
    </DomainPage>
  );
}
