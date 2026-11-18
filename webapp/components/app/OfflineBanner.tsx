"use client";

import { useSyncExternalStore } from "react";
import { OFFLINE_MESSAGE } from "@/lib/fetch-json";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** True when the browser reports no connection. Server render and first paint assume online. */
export function useIsOffline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine === false,
    () => false
  );
}

/** A persistent notice while offline, so a failed load or save is not a mystery. */
export function OfflineBanner() {
  const offline = useIsOffline();
  if (!offline) return null;
  return (
    <div className="callout urgent" role="status" aria-live="polite">
      <span className="ico">Offline</span>
      <b>{OFFLINE_MESSAGE}</b> Changes you make now won&apos;t be saved until you&apos;re back online.
    </div>
  );
}
