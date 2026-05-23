"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import { createEmptyState, mergeWithDefaults } from "@/lib/finance/defaults";
import type { DashboardState } from "@/lib/types";

const LOCAL_KEY = "sgfinance_dashboard";
const DEBOUNCE_MS = 800;

function readLocalDraft(): DashboardState | null {
  try {
    const local = localStorage.getItem(LOCAL_KEY);
    if (!local) return null;
    return mergeWithDefaults(JSON.parse(local));
  } catch {
    return null;
  }
}

function writeLocalDraft(state: DashboardState) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("[dashboard] localStorage save failed", e);
  }
}

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
      const { res, data: json } = await fetchJson<{
        data?: Partial<DashboardState>;
        updatedAt?: string | null;
        source?: string;
        error?: string;
      }>("/api/state", { credentials: "include" });
      if (!res.ok) {
        throw new Error(json.error ?? `Failed to load (${res.status})`);
      }
      const merged = mergeWithDefaults(json.data ?? {});

      if (json.source === "database") {
        setState(merged);
        setLastSaved(json.updatedAt ?? null);
        writeLocalDraft(merged);
        console.info("[dashboard] loaded from Supabase", {
          updatedAt: json.updatedAt,
        });
      } else {
        const local = readLocalDraft();
        if (local) {
          setState(local);
          flash("Loaded from browser (no cloud snapshot yet)");
          console.info("[dashboard] cloud empty — using local draft");
        } else {
          setState(merged);
          console.info("[dashboard] no cloud or local data — empty state");
        }
        setLastSaved(json.updatedAt ?? null);
      }
    } catch (e) {
      console.warn("[dashboard] Supabase load failed, trying local draft", e);
      const local = readLocalDraft();
      if (local) {
        setState(local);
        flash("Loaded from browser (cloud unavailable)");
      } else {
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
      writeLocalDraft(next);

      try {
        const { res, data: json } = await fetchJson<{
          updatedAt?: string;
          source?: string;
          warning?: string;
          error?: string;
        }>("/api/state", {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: next }),
        });
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
