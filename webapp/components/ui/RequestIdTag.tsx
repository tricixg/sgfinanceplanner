"use client";

import { useState } from "react";
import { requestIdForChannel, requestIdForMessage } from "@/lib/observability/client-request-ids";

/**
 * A small, copyable reference for an error that came from the server, so it can be matched to the
 * logs. Pass the message being shown (the server's text is looked up), or a `channel` for messages
 * the client wrote itself. Renders nothing when the failure never reached the server.
 */
export function RequestIdTag({
  message,
  channel,
  requestId,
}: {
  message?: string | null;
  channel?: string;
  requestId?: string | null;
}) {
  const id = requestId ?? (channel ? requestIdForChannel(channel) : null) ?? requestIdForMessage(message);
  const [copied, setCopied] = useState(false);
  if (!id) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the ID is still on screen to select by hand.
    }
  };

  return (
    <small className="request-id" style={{ display: "block", opacity: 0.75, marginTop: 4 }}>
      Ref <code style={{ userSelect: "all", wordBreak: "break-all" }}>{id}</code>{" "}
      <button type="button" className="btn ghost sm" style={{ padding: "0 6px" }} onClick={() => void copy()}>
        {copied ? "Copied" : "Copy"}
      </button>
    </small>
  );
}
