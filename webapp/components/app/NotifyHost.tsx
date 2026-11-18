"use client";

import { useEffect } from "react";
import { Snackbar } from "@/components/Snackbar";
import { useSnackbar } from "@/hooks/useSnackbar";
import { NOTIFY_EVENT, type Notice } from "@/lib/ui/notify";

/** Renders notices raised with `notifyError` / `notifySuccess`. Mount once, in the app shell. */
export function NotifyHost() {
  const snackbar = useSnackbar();
  const { show } = snackbar;
  useEffect(() => {
    const onNotice = (event: Event) => {
      const notice = (event as CustomEvent<Notice>).detail;
      if (!notice?.message) return;
      // Errors stay up long enough to read.
      show(notice.message, { error: notice.error, durationMs: notice.error ? 8000 : 2500 });
    };
    // Safety net: a save or load that threw where nobody caught it would otherwise fail silently
    // (the action just seems to do nothing). Say so, once in a while, and keep the console error.
    let lastShownAt = 0;
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      if (!(reason instanceof Error)) return;
      console.error("[NotifyHost] unhandled rejection", reason);
      const now = Date.now();
      if (now - lastShownAt < 5000) return;
      lastShownAt = now;
      show(reason.message || "Something went wrong. Please try again.", { error: true, durationMs: 8000 });
    };
    window.addEventListener(NOTIFY_EVENT, onNotice);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener(NOTIFY_EVENT, onNotice);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [show]);
  return (
    <Snackbar
      message={snackbar.message}
      variant={snackbar.variant}
      durationMs={snackbar.durationMs}
      onDismiss={snackbar.dismiss}
    />
  );
}
