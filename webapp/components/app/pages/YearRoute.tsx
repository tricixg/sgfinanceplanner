"use client";

import { DomainPage } from "@/components/app/DomainPage";
import { TabYear } from "@/components/tabs/TabYear";
import { useAppSession } from "@/contexts/AppSessionContext";
import { usePageSavings } from "@/hooks/usePageSavings";
import { useCardStatements } from "@/hooks/useCardStatements";
import { LoadErrorCallout } from "@/components/app/LoadErrorCallout";

function YearContent({
  state,
  setState,
  cardBundle,
  cardsLoading,
}: {
  state: Parameters<typeof TabYear>[0]["state"];
  setState: Parameters<typeof TabYear>[0]["setState"];
  cardBundle: ReturnType<typeof useCardStatements>["bundle"];
  cardsLoading: boolean;
}) {
  const user = useAppSession();
  const { savingsTotals } = usePageSavings(user?.id, state);
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
  const user = useAppSession();
  // Open card cycles feed the card-balance liability in the projection's starting net worth
  // (same input the Cash Accounts page uses). Fetched here, not in YearContent, so the request
  // starts on route entry instead of after the core data has loaded.
  const {
    bundle: cardBundle,
    loading: cardsLoading,
    loadError: cardsError,
    reload: reloadCards,
  } = useCardStatements(Boolean(user?.id));
  return (
    <DomainPage>
      {({ state, setState, loading }) =>
        loading ? (
          <p className="loading">Loading your financial data…</p>
        ) : (
          <>
            {cardsError ? (
              <LoadErrorCallout
                title="Couldn’t load your card statements."
                onRetry={() => void reloadCards()}
              >
                Card balances may be missing, so the projection&apos;s starting net worth may be too high.
              </LoadErrorCallout>
            ) : null}
            <YearContent
              state={state}
              setState={setState}
              cardBundle={cardBundle}
              cardsLoading={cardsLoading}
            />
          </>
        )
      }
    </DomainPage>
  );
}
