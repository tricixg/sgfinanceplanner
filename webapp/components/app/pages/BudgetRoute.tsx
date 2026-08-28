"use client";

import { DomainPage } from "@/components/app/DomainPage";
import { TabBudgetSavings } from "@/components/tabs/TabBudgetSavings";
import { useAppSession } from "@/contexts/AppSessionContext";
import { usePageSavings } from "@/hooks/usePageSavings";

function BudgetContent({
  state,
  setState,
}: {
  state: Parameters<typeof TabBudgetSavings>[0]["state"];
  setState: Parameters<typeof TabBudgetSavings>[0]["setState"];
}) {
  const user = useAppSession();
  const { savingsTotals } = usePageSavings(user?.id, state);
  return (
    <TabBudgetSavings state={state} setState={setState} savings={savingsTotals} />
  );
}

export function BudgetRoute() {
  return (
    <DomainPage>
      {({ state, setState, loading }) =>
        loading ? (
          <p className="loading">Loading your financial data…</p>
        ) : (
          <BudgetContent state={state} setState={setState} />
        )
      }
    </DomainPage>
  );
}
