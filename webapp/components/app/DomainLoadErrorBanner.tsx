"use client";

import { useDomainLoadError } from "@/hooks/useDomainLoadError";
import type { GuardedDomain } from "@/lib/sync/explicit-delete";

/** Shown when a domain failed to load; editing is disabled until a retry succeeds. */
export function DomainLoadErrorBanner({ domain }: { domain: GuardedDomain }) {
  const { error, label, retry } = useDomainLoadError(domain);
  if (!error) return null;
  return (
    <div className="callout urgent" role="alert">
      <span className="ico">Warning</span>
      <b>Couldn&apos;t load your {label}.</b> What you see below may be incomplete, so
      editing is turned off to protect your saved data.{" "}
      <button type="button" className="btn ghost sm" onClick={retry}>
        Retry
      </button>
    </div>
  );
}
