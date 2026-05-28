"use client";

import { useEffect, useState } from "react";
import { DomainPage } from "@/components/app/DomainPage";
import { TabNow } from "@/components/tabs/TabNow";
import { useAppSession } from "@/contexts/AppSessionContext";
import { usePageSavings } from "@/hooks/usePageSavings";
import { currentYm } from "@/lib/finance/helpers";
import { fetchJson } from "@/lib/fetch-json";

function NowContent({
  state,
  setState,
}: {
  state: Parameters<typeof TabNow>[0]["state"];
  setState: Parameters<typeof TabNow>[0]["setState"];
}) {
  const user = useAppSession();
  const { savingsTotals } = usePageSavings(user?.id, state);
  const startYm = state.cashflowStartYm || currentYm();
  const [prefetchByYm, setPrefetchByYm] = useState<Record<string, number> | null>(null);
  const [prefetchLoading, setPrefetchLoading] = useState(false);

  useEffect(() => {
    if (!user || !startYm) {
      setPrefetchByYm(null);
      return;
    }
    let cancelled = false;
    setPrefetchLoading(true);
    void (async () => {
      const qs = new URLSearchParams({ startYm, count: "5" });
      const { res, data } = await fetchJson<{ byYm?: Record<string, number> }>(
        `/api/cashflow/additive-income?${qs}`,
        { credentials: "include" }
      );
      if (cancelled) return;
      if (res.ok && data.byYm) {
        setPrefetchByYm(data.byYm);
        console.info("[NowRoute] additive prefetched", { startYm });
      } else {
        setPrefetchByYm(null);
      }
      setPrefetchLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, startYm]);

  return (
    <TabNow
      state={state}
      setState={setState}
      savings={savingsTotals}
      authEnabled={Boolean(user)}
      preloadedAdditiveByYm={prefetchByYm}
      preloadedAdditiveLoading={prefetchLoading}
      preloadedAdditiveStartYm={startYm}
    />
  );
}

export function NowRoute() {
  return (
    <DomainPage>
      {({ state, setState }) => <NowContent state={state} setState={setState} />}
    </DomainPage>
  );
}
