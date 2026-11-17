"use client";

import { useContext } from "react";
import { AccountsContext, AppDataContext } from "@/contexts/app-data-contexts";
import { domainLabel, type GuardedDomain } from "@/lib/sync/explicit-delete";

/**
 * Load-failure state for a domain with whole-list saves. While `error` is set
 * the domain's list is not the user's real data, so its Edit controls must be
 * disabled (the save hooks also refuse to run).
 */
export function useDomainLoadError(domain: GuardedDomain): {
  error: string | null;
  label: string;
  retry: () => void;
} {
  const app = useContext(AppDataContext);
  const accounts = useContext(AccountsContext);
  if (domain === "accounts") {
    return {
      error: accounts?.loadError ?? null,
      label: domainLabel(domain),
      retry: () => void accounts?.reload(),
    };
  }
  return {
    error: app?.loadErrors?.[domain] ?? null,
    label: domainLabel(domain),
    retry: () => void app?.reload(),
  };
}
