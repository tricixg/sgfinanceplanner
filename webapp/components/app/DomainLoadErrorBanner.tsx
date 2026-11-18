"use client";

import { LoadErrorCallout } from "@/components/app/LoadErrorCallout";
import { blocksEditing, useDomainLoadError, type LoadErrorDomain } from "@/hooks/useDomainLoadError";

/** Shown when a domain failed to load; where it applies, editing is disabled until a retry succeeds. */
export function DomainLoadErrorBanner({ domain }: { domain: LoadErrorDomain }) {
  const { error, label, retry } = useDomainLoadError(domain);
  if (!error) return null;
  return (
    <LoadErrorCallout
      title={`Couldn’t load your ${label}.`}
      onRetry={retry}
      message={error}
      channel={`domain:${domain}`}
    >
      {blocksEditing(domain)
        ? "What you see below may be incomplete, so editing is turned off to protect your saved data."
        : "What you see below may be incomplete or out of date."}
    </LoadErrorCallout>
  );
}
