"use client";

import type { ReactNode } from "react";
import { RequestIdTag } from "@/components/ui/RequestIdTag";

/** The one look for "this section failed to load": what failed, what it means, and Retry. */
export function LoadErrorCallout({
  title,
  children,
  onRetry,
  message,
  channel,
}: {
  title: string;
  children?: ReactNode;
  onRetry: () => void;
  /** The server's error text, if shown/known, to look up the request reference. */
  message?: string | null;
  /** Or the channel a client-written failure was filed under (see client-request-ids). */
  channel?: string;
}) {
  return (
    <div className="callout urgent" role="alert">
      <span className="ico">Warning</span>
      <b>{title}</b> {children}{" "}
      <button type="button" className="btn ghost sm" onClick={onRetry}>
        Retry
      </button>
      <RequestIdTag message={message} channel={channel} />
    </div>
  );
}
