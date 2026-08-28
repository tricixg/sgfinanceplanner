"use client";

import { DomainPage } from "@/components/app/DomainPage";
import { TabThisMonth } from "@/components/tabs/TabThisMonth";
import { useAppSession } from "@/contexts/AppSessionContext";

function ThisMonthContent({
  state,
  setState,
}: {
  state: Parameters<typeof TabThisMonth>[0]["state"];
  setState: Parameters<typeof TabThisMonth>[0]["setState"];
}) {
  useAppSession();
  return <TabThisMonth state={state} setState={setState} />;
}

export function ThisMonthRoute() {
  return (
    <DomainPage>
      {({ state, setState, loading }) =>
        loading ? (
          <p className="loading">Loading your financial data…</p>
        ) : (
          <ThisMonthContent state={state} setState={setState} />
        )
      }
    </DomainPage>
  );
}
