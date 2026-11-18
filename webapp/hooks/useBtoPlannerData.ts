"use client";

import { useCallback, useContext, useMemo } from "react";
import type { BtoPlannerPrefs, DashboardState } from "@/lib/types";
import { resolveBtoPlannerPrefs, splitSharedBtoFields } from "@/lib/finance";
import { AppDataContext } from "@/contexts/app-data-contexts";
import { useHousehold } from "@/hooks/useHousehold";
import { useHouseholdBtoPlanner } from "@/hooks/useHouseholdBtoPlanner";
import { usePartnerCpf } from "@/hooks/usePartnerCpf";
import { usePartnerBtoPayments } from "@/hooks/usePartnerBtoPayments";
import type { BtoPaymentRow } from "@/lib/finance/bto-reconcile";

/**
 * Everything the BTO planner reads from the database — saved planner prefs
 * (personal profile + shared household plan), the partner's live CPF, and
 * logged CPF contributions — plus the save path. Shared by the BTO tab and
 * the price finder subpage so both see the same numbers.
 */
export function useBtoPlannerData(
  S: DashboardState,
  setState: (s: DashboardState | ((p: DashboardState) => DashboardState)) => void
) {
  const appData = useContext(AppDataContext);
  const household = useHousehold();
  const { partnerCpf, loading: partnerCpfLoading } = usePartnerCpf();
  const {
    sharedBto,
    loading: sharedBtoLoading,
    loadError: sharedBtoError,
    reload: reloadSharedBto,
    saveSharedBto,
  } = useHouseholdBtoPlanner();
  const {
    partnerPayments,
    loading: partnerPaymentsLoading,
    loadError: partnerPaymentsError,
    reload: reloadPartnerPayments,
  } = usePartnerBtoPayments();
  const loadError = sharedBtoError ?? partnerPaymentsError;
  const reloadFailed = useCallback(() => {
    if (sharedBtoError) void reloadSharedBto();
    if (partnerPaymentsError) void reloadPartnerPayments();
  }, [sharedBtoError, partnerPaymentsError, reloadSharedBto, reloadPartnerPayments]);

  const savedPrefs = useMemo(() => resolveBtoPlannerPrefs(S, sharedBto), [S, sharedBto]);

  const savePrefs = useCallback(
    async (prefs: BtoPlannerPrefs) => {
      // A shared plan that failed to load looks like "no shared plan"; saving now would overwrite
      // the household's real one (and your partner's view of it) with these local values.
      if (sharedBtoError) {
        throw new Error(
          "Couldn't load your shared BTO plan, so saving is turned off. Retry the load and try again."
        );
      }
      const saves: Promise<unknown>[] = [saveSharedBto(splitSharedBtoFields(prefs))];
      if (appData?.configured) {
        saves.push(appData.saveProfile({ btoPlanner: prefs }));
      } else {
        setState((prev) => ({ ...prev, btoPlanner: prefs }));
      }
      await Promise.all(saves);
      console.info("[useBtoPlannerData] planner prefs saved");
    },
    [appData, saveSharedBto, setState, sharedBtoError]
  );

  // Partner OA: live balance from a linked household account wins when available;
  // the manual pOA field is the fallback (unpaired, or partner hasn't set a profile).
  const partnerOALive = partnerCpf?.paired ? partnerCpf.oa : null;

  // Household BTO payment ledger: your BTO-tagged rows + your partner's.
  const selfTransactions = appData?.cpfTransactions;
  const btoPayments = useMemo<BtoPaymentRow[]>(
    () =>
      [
        ...(selfTransactions ?? [])
          .filter((t) => t.btoStage != null)
          .map((t) => ({ ...t, owner: "self" as const })),
        ...partnerPayments.map((t) => ({ ...t, owner: "partner" as const })),
      ].sort((a, b) => b.txnDate.localeCompare(a.txnDate) || b.createdAt.localeCompare(a.createdAt)),
    [selfTransactions, partnerPayments]
  );

  return {
    household,
    partnerCpf,
    partnerCpfLoading,
    sharedBto,
    sharedBtoLoading,
    savedPrefs,
    savePrefs,
    partnerOALive,
    selfMonthlyFromContrib: appData?.cpfContributions?.[0]?.oa ?? null,
    selfLatestContribMonth: appData?.cpfContributions?.[0]?.month ?? null,
    partnerMonthlyFromContrib: partnerCpf?.paired ? partnerCpf.latestMonthlyOA : null,
    btoPayments,
    partnerPaymentsLoading,
    loadError,
    reloadFailed,
  };
}
