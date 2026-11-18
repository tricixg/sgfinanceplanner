"use client";

import type { ReactNode } from "react";

/** The one look for "this section failed to load": what failed, what it means, and Retry. */
export function LoadErrorCallout({
  title,
  children,
  onRetry,
}: {
  title: string;
  children?: ReactNode;
  onRetry: () => void;
}) {
  return (
    <div className="callout urgent" role="alert">
      <span className="ico">Warning</span>
      <b>{title}</b> {children}{" "}
      <button type="button" className="btn ghost sm" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
