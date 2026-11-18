"use client";

import { createEmptyState } from "@/lib/finance/defaults";
import { useAppData } from "@/hooks/useAppData";
import { useAppSession } from "@/contexts/AppSessionContext";
import { DomainLoadErrorBanners } from "@/components/app/DomainLoadErrorBanners";

type Props = {
  children: (ctx: {
    state: ReturnType<typeof useAppData>["state"];
    setState: ReturnType<typeof useAppData>["setState"];
    cardsApi: ReturnType<typeof useAppData>["cardsApi"];
    loading: boolean;
    snapshotsLoading: boolean;
  }) => React.ReactNode;
};

/** Domain tab content — reads session-cached app data from AppDataProvider. */
export function DomainPage({ children }: Props) {
  const user = useAppSession();
  const { state, setState, loading, snapshotsLoading, cardsApi } = useAppData();

  return (
    <>
      <DomainLoadErrorBanners />
      {children({
        state: user?.id ? state : createEmptyState(),
        setState,
        cardsApi,
        loading,
        snapshotsLoading,
      })}
    </>
  );
}
