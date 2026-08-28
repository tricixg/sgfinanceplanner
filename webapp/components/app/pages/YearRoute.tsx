"use client";

import { DomainPage } from "@/components/app/DomainPage";
import { TabYear } from "@/components/tabs/TabYear";
import { useAppSession } from "@/contexts/AppSessionContext";
import { usePageSavings } from "@/hooks/usePageSavings";

function YearContent({
  state,
  setState,
}: {
  state: Parameters<typeof TabYear>[0]["state"];
  setState: Parameters<typeof TabYear>[0]["setState"];
}) {
  const user = useAppSession();
  const { savingsTotals } = usePageSavings(user?.id, state);
  return <TabYear state={state} setState={setState} savings={savingsTotals} />;
}

export function YearRoute() {
  return (
    <DomainPage>
      {({ state, setState, loading }) =>
        loading ? (
          <p className="loading">Loading your financial data…</p>
        ) : (
          <YearContent state={state} setState={setState} />
        )
      }
    </DomainPage>
  );
}
