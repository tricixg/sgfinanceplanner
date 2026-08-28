"use client";

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import type { FinancialAccount } from "@/lib/transactions/types";
import { FinancialAccountsContext } from "@/contexts/app-data-contexts";
import { useDomainEvent } from "@/hooks/useDomainEvent";

export function useFinancialAccountsProvider(enabled: boolean) {
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [configured, setConfigured] = useState(false);

  const load = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { res, data } = await fetchJson<{
        configured?: boolean;
        accounts?: FinancialAccount[];
        error?: string;
      }>("/api/financial-accounts", { credentials: "include" });
      if (!res.ok || !data.configured) {
        setConfigured(false);
        setAccounts([]);
        return;
      }
      setConfigured(true);
      setAccounts(data.accounts ?? []);
      console.info("[useFinancialAccounts] loaded", { count: data.accounts?.length ?? 0 });
    } catch (e) {
      console.error("[useFinancialAccounts] load failed", e);
      setConfigured(false);
      setAccounts([]);
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

  useDomainEvent(["accounts:changed", "cards:changed", "savings:changed"], () => {
    void load();
  });

  return {
    accounts,
    loading,
    configured,
    reload: load,
    ensureLoaded,
  };
}

export function useFinancialAccounts() {
  const ctx = useContext(FinancialAccountsContext);
  if (!ctx) {
    throw new Error("useFinancialAccounts must be used within AppDataProvider");
  }
  useEffect(() => {
    ctx.ensureLoaded();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ensureLoaded only, not ctx itself
  }, [ctx.ensureLoaded]);
  return ctx;
}
