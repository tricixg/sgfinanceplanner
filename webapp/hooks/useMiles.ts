"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import { errorMessage } from "@/lib/ui/notify";
import type { MilesAction } from "@/lib/miles/ledger";
import type { MilesActivity, MilesLot } from "@/lib/miles/types";
import { MilesContext } from "@/contexts/app-data-contexts";
import { dispatchDomainEvent } from "@/lib/events/domain-events";

type MilesResponse = {
  configured?: boolean;
  lots?: MilesLot[];
  activity?: MilesActivity[];
  error?: string;
};

export function useMilesProvider(enabled: boolean) {
  const [lots, setLots] = useState<MilesLot[]>([]);
  const [activity, setActivity] = useState<MilesActivity[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [configured, setConfigured] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const { res, data } = await fetchJson<MilesResponse>("/api/miles", { credentials: "include" });
      if (!res.ok) {
        setConfigured(false);
        setLoadError(data.error ?? "Couldn't load your miles.");
        return;
      }
      if (!data.configured) {
        setConfigured(false);
        return;
      }
      setConfigured(true);
      setLots(data.lots ?? []);
      setActivity(data.activity ?? []);
      console.info("[useMiles] loaded", { lots: data.lots?.length, activity: data.activity?.length });
    } catch (e) {
      console.error("[useMiles] load failed", e);
      setConfigured(false);
      setLoadError(errorMessage(e, "Couldn't load your miles."));
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  const requestedRef = useRef(false);
  const ensureLoaded = useCallback(() => {
    if (requestedRef.current) return;
    requestedRef.current = true;
    void load();
  }, [load]);

  // dispatchEvent runs listeners synchronously, so this is only true during our own dispatch.
  const selfDispatchRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const onMilesChanged = (event: Event) => {
      if (selfDispatchRef.current) return; // our own save already applied the new data
      console.info("[useMiles] reload from event", { source: event.type });
      void load();
    };
    window.addEventListener("miles:changed", onMilesChanged);
    return () => {
      window.removeEventListener("miles:changed", onMilesChanged);
    };
  }, [enabled, load]);

  /** Runs one ledger change; throws with the server's message so the form can show it. */
  const mutate = useCallback(async (action: MilesAction) => {
    const { res, data } = await fetchJson<MilesResponse>("/api/miles", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    });
    if (!res.ok) {
      throw new Error(data.error ?? "Couldn't save that change to your miles");
    }
    setLots(data.lots ?? []);
    setActivity(data.activity ?? []);
    console.info("[useMiles] saved", { action: action.action });
    selfDispatchRef.current = true;
    try {
      dispatchDomainEvent("miles:changed");
    } finally {
      selfDispatchRef.current = false;
    }
  }, []);

  return useMemo(
    () => ({ lots, activity, loading, configured, loadError, reload: load, ensureLoaded, mutate }),
    [lots, activity, loading, configured, loadError, load, ensureLoaded, mutate]
  );
}

export function useMiles() {
  const ctx = useContext(MilesContext);
  if (!ctx) {
    throw new Error("useMiles must be used within AppDataProvider");
  }
  useEffect(() => {
    ctx.ensureLoaded();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ensureLoaded only, not ctx itself
  }, [ctx.ensureLoaded]);
  return ctx;
}
