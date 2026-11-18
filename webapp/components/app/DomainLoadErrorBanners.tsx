"use client";

import { DomainLoadErrorBanner } from "@/components/app/DomainLoadErrorBanner";
import type { LoadErrorDomain } from "@/hooks/useDomainLoadError";

/** Every domain a route can read as app data. Only requested domains can be in error, so a page shows just its own. */
const APP_DOMAINS: readonly LoadErrorDomain[] = [
  "profile",
  "loans",
  "otherLoans",
  "cards",
  "holdings",
  "accounts",
  "budget",
  "prefs",
  "snapshots",
  "netWorth",
  "cpfContributions",
  "cpfTransactions",
];

/** One Retry banner per failed domain (REL-001). Renders nothing when everything loaded. */
export function DomainLoadErrorBanners() {
  return (
    <>
      {APP_DOMAINS.map((d) => (
        <DomainLoadErrorBanner key={d} domain={d} />
      ))}
    </>
  );
}
