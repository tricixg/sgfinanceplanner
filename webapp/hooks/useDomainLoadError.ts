"use client";

import { useContext } from "react";
import {
  AccountsContext,
  AppDataContext,
  FundsContext,
  HouseholdContext,
  MilesContext,
} from "@/contexts/app-data-contexts";
import type { DataDomain } from "@/lib/app/domains";
import { DOMAIN_LABEL } from "@/lib/app/domains";
import { domainLabel, type GuardedDomain } from "@/lib/sync/explicit-delete";

/**
 * Domains that are shown but not (or not only) behind whole-list saves, so their failure is
 * reported from the load status instead of `loadErrors` (which also gates the net-worth snapshot).
 * A failed `budget` still blocks saves: the save hooks refuse unless the domain loaded.
 */
export type ViewDomain = Extract<
  DataDomain,
  "budget" | "prefs" | "snapshots" | "netWorth" | "cpfContributions" | "cpfTransactions"
>;

/** Separately loaded domains with their own `loadError` + `reload` (funds, miles, household). */
export type SideDomain = "funds" | "miles" | "household";

export type LoadErrorDomain = GuardedDomain | ViewDomain | SideDomain;

const SIDE_LABELS: Record<SideDomain, string> = {
  funds: "investment funds",
  miles: "miles balances",
  household: "household and partner details",
};

/** True when a failure also turns editing off (the save hooks refuse to run). */
export function blocksEditing(domain: LoadErrorDomain): boolean {
  return domain !== "prefs" && domain !== "snapshots" && domain !== "netWorth" &&
    domain !== "cpfContributions" && domain !== "cpfTransactions" && domain !== "household";
}

/**
 * Load-failure state for a domain. While `error` is set the domain's list is not the user's real
 * data: for the domains that blocksEditing(), Edit controls must be disabled (the save hooks also
 * refuse to run).
 */
export function useDomainLoadError(domain: LoadErrorDomain): {
  error: string | null;
  label: string;
  retry: () => void;
} {
  const app = useContext(AppDataContext);
  const accounts = useContext(AccountsContext);
  const funds = useContext(FundsContext);
  const miles = useContext(MilesContext);
  const household = useContext(HouseholdContext);

  if (domain === "accounts") {
    return {
      error: accounts?.loadError ?? null,
      label: domainLabel(domain),
      retry: () => void accounts?.reload(),
    };
  }
  if (domain === "funds" || domain === "miles" || domain === "household") {
    const ctx = domain === "funds" ? funds : domain === "miles" ? miles : household;
    return {
      error: ctx?.loadError ?? null,
      label: SIDE_LABELS[domain],
      retry: () => void ctx?.reload(),
    };
  }
  if (
    domain === "budget" || domain === "prefs" || domain === "snapshots" || domain === "netWorth" ||
    domain === "cpfContributions" || domain === "cpfTransactions"
  ) {
    const failed = app?.domainStatus?.[domain] === "error";
    const retry =
      domain === "snapshots" ? app?.reloadSnapshots
      : domain === "netWorth" ? app?.reloadNetWorthHistory
      : domain === "cpfContributions" ? app?.reloadCpfContributions
      : domain === "cpfTransactions" ? app?.reloadCpfTransactions
      : app?.reload;
    return {
      error: failed ? `Couldn't load ${DOMAIN_LABEL[domain].toLowerCase()}` : null,
      label: DOMAIN_LABEL[domain].toLowerCase(),
      retry: () => void retry?.(),
    };
  }
  return {
    error: app?.loadErrors?.[domain] ?? null,
    label: domainLabel(domain),
    retry: () => void app?.reload(),
  };
}
