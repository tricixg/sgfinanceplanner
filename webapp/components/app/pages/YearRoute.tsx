"use client";

import { DomainPage } from "@/components/app/DomainPage";
import { TabYear } from "@/components/tabs/TabYear";
import { useAppSession } from "@/contexts/AppSessionContext";
import { usePageSavings } from "@/hooks/usePageSavings";
import { useCardStatements } from "@/hooks/useCardStatements";

function YearContent({
  state,
  setState,
}: {
  state: Parameters<typeof TabYear>[0]["state"];
  setState: Parameters<typeof TabYear>[0]["setState"];
}) {
  const user = useAppSession();
  const { savingsTotals } = usePageSavings(user?.id, state);
  // Open card cycles feed the card-balance liability in the projection's
  // starting net worth (same input the Cash Accounts page uses).
  const { bundle: cardBundle, loading: cardsLoading } = useCardStatements(
    Boolean(user?.id)
  );
  if (cardsLoading) return <p className="loading">Loading your financial data…</p>;
  return (
    <TabYear
      state={state}
      setState={setState}
      savings={savingsTotals}
      openCycles={cardBundle.openCycles}
    />
  );
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
