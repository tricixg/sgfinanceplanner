"use client";

import { useEffect, useRef } from "react";
import type { DomainEventName } from "@/lib/events/domain-events";

type Options = {
  /** Coalesce burst dispatches (ms). Default 150. Set 0 to disable. */
  debounceMs?: number;
};

function namesKeyFrom(names: DomainEventName | DomainEventName[]): string {
  const list = Array.isArray(names) ? names : [names];
  return [...list].sort().join("|");
}

/**
 * Re-run handler when one or more domain mutation events fire.
 * SSR-safe: only attaches listeners in useEffect.
 * The handler always reads the latest closure via ref.
 */
export function useDomainEvent(
  names: DomainEventName | DomainEventName[],
  handler: () => void,
  options?: Options
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const debounceMs = options?.debounceMs ?? 150;
  const namesKey = namesKeyFrom(names);

  useEffect(() => {
    const eventNames = namesKey.split("|") as DomainEventName[];
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = () => {
      handlerRef.current();
    };

    const onEvent = () => {
      if (debounceMs <= 0) {
        run();
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, debounceMs);
    };

    for (const name of eventNames) {
      window.addEventListener(name, onEvent);
    }
    return () => {
      if (timer) clearTimeout(timer);
      for (const name of eventNames) {
        window.removeEventListener(name, onEvent);
      }
    };
  }, [debounceMs, namesKey]);
}
