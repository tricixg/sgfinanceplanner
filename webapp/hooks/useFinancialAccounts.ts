"use client";

import { useCallback, useContext, useEffect, useState } from "react";
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

  useEffect(() => {
    void load();
  }, [load]);

  useDomainEvent(["accounts:changed", "cards:changed", "savings:changed"], () => {
    void load();
  }, [load]);

  return {
    accounts,
    loading,
    configured,
    reload: load,
  };
}

export function useFinancialAccounts() {
  const ctx = useContext(FinancialAccountsContext);
  if (!ctx) {
    throw new Error("useFinancialAccounts must be used within AppDataProvider");
  }
  return ctx;
}
