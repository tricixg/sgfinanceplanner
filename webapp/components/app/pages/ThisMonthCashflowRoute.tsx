"use client";

import { DomainPage } from "@/components/app/DomainPage";
import { TabThisMonthCashflow } from "@/components/tabs/TabThisMonthCashflow";
import { useAppSession } from "@/contexts/AppSessionContext";

function ThisMonthCashflowContent({
  state,
}: {
  state: Parameters<typeof TabThisMonthCashflow>[0]["state"];
}) {
  const user = useAppSession();
  return <TabThisMonthCashflow state={state} authEnabled={Boolean(user)} />;
}

export function ThisMonthCashflowRoute() {
  return (
    <DomainPage>
      {({ state, loading }) =>
        loading ? (
          <p className="loading">Loading your financial data…</p>
        ) : (
          <ThisMonthCashflowContent state={state} />
        )
      }
    </DomainPage>
  );
}
