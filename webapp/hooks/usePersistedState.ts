"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createEmptyState, mergeWithDefaults } from "@/lib/finance/defaults";
import type { DashboardState } from "@/lib/types";

const LOCAL_KEY = "sgfinance_dashboard";
const DEBOUNCE_MS = 800;

export function usePersistedState() {
  const [state, setState] = useState<DashboardState>(createEmptyState);
  const [loading, setLoading] = useState(true);
  const [saveMsg, setSaveMsg] = useState("");
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipSaveRef = useRef(true);

  const flash = useCallback((msg: string) => {
    setSaveMsg(msg);
    setTimeout(() => setSaveMsg(""), 2500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/state", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      const json = await res.json();
      const merged = mergeWithDefaults(json.data ?? {});
      setState(merged);
      setLastSaved(json.updatedAt ?? null);
      console.info("[dashboard] loaded state", { source: json.source });
    } catch (e) {
      console.warn("[dashboard] load failed, using local fallback", e);
      try {
        const local = localStorage.getItem(LOCAL_KEY);
        if (local) {
          setState(mergeWithDefaults(JSON.parse(local)));
          flash("Loaded from browser (server unavailable)");
        }
      } catch {
        setState(createEmptyState());
      }
    } finally {
      setLoading(false);
      skipSaveRef.current = false;
    }
  }, [flash]);

  useEffect(() => {
    load();
  }, [load]);

  const persist = useCallback(
    async (next: DashboardState) => {
      try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
      } catch (e) {
        console.warn("[dashboard] localStorage save failed", e);
      }

      try {
        const res = await fetch("/api/state", {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: next }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Save failed");
        setLastSaved(json.updatedAt ?? new Date().toISOString());
        if (json.warning) {
          flash(json.warning);
        } else {
          flash("Saved to cloud");
        }
        console.info("[dashboard] saved state", { source: json.source });
      } catch (e) {
        console.error("[dashboard] cloud save failed", e);
        flash("Saved locally only");
      }
    },
    [flash]
  );

  const setStateAndSave = useCallback(
    (updater: DashboardState | ((prev: DashboardState) => DashboardState)) => {
      setState((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        if (!skipSaveRef.current) {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => persist(next), DEBOUNCE_MS);
        }
        return next;
      });
    },
    [persist]
  );

  const saveNow = useCallback(async () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    await persist(state);
  }, [persist, state]);

  return {
    state,
    setState: setStateAndSave,
    setStateImmediate: setState,
    loading,
    saveMsg,
    flash,
    lastSaved,
    saveNow,
    reload: load,
  };
}
