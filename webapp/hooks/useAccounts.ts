"use client";

import { useCallback, useContext, useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import {
  ACCOUNTS_CHANGED_EVENT,
  SAVINGS_LEDGER_RECORDED_EVENT,
} from "@/lib/savings/accounts-events";
import type { AccountsBundle, UserSavingsAccount } from "@/lib/savings/types";
import { AccountsContext } from "@/contexts/app-data-contexts";

export function useAccountsProvider(enabled: boolean) {
  const [accounts, setAccounts] = useState<UserSavingsAccount[]>([]);
  const [totals, setTotals] = useState<AccountsBundle["totals"] | null>(null);
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
        accounts?: UserSavingsAccount[];
        totals?: AccountsBundle["totals"];
        error?: string;
      }>("/api/accounts", { credentials: "include" });
      if (!res.ok || !data.configured) {
        setConfigured(false);
        return;
      }
      setConfigured(true);
      setAccounts(data.accounts ?? []);
      setTotals(data.totals ?? null);
      console.info("[useAccounts] loaded", { count: data.accounts?.length });
    } catch (e) {
      console.error("[useAccounts] load failed", e);
      setConfigured(false);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!enabled) return;
    const onAccountsChanged = (event: Event) => {
      const source =
        event instanceof CustomEvent && typeof event.detail?.source === "string"
          ? event.detail.source
          : event.type;
      console.info("[useAccounts] reload from event", { source });
      void load();
    };
    window.addEventListener(ACCOUNTS_CHANGED_EVENT, onAccountsChanged);
    window.addEventListener(SAVINGS_LEDGER_RECORDED_EVENT, onAccountsChanged);
    return () => {
      window.removeEventListener(ACCOUNTS_CHANGED_EVENT, onAccountsChanged);
      window.removeEventListener(SAVINGS_LEDGER_RECORDED_EVENT, onAccountsChanged);
    };
  }, [enabled, load]);

  const saveAccounts = useCallback(
    async (next: UserSavingsAccount[]) => {
      const { res, data } = await fetchJson<{
        configured?: boolean;
        accounts?: UserSavingsAccount[];
        totals?: AccountsBundle["totals"];
        error?: string;
      }>("/api/accounts", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accounts: next }),
      });
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to save accounts");
      }
      setAccounts(data.accounts ?? next);
      setTotals(data.totals ?? null);
      console.info("[useAccounts] saved", { count: next.length });
      await load();
    },
    [load]
  );

  const recordAccountTransaction = useCallback(
    async (
      accountId: string,
      payload: {
        amount: number;
        occurredAt?: string;
      kind?: "deposit" | "withdrawal" | "adjustment";
      note?: string;
      goalId?: string | null;
      incomeCategoryId?: string;
    }
    ) => {
      const { res, data } = await fetchJson<{ error?: string }>(
        `/api/accounts/${accountId}/transactions`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        throw new Error(data.error ?? "Transaction failed");
      }
      console.info("[useAccounts] transaction recorded", { accountId, ...payload });
      await load();
    },
    [load]
  );

  return {
    accounts,
    totals,
    loading,
    configured,
    reload: load,
    saveAccounts,
    recordAccountTransaction,
  };
}

export function useAccounts() {
  const ctx = useContext(AccountsContext);
  if (!ctx) {
    throw new Error("useAccounts must be used within AppDataProvider");
  }
  return ctx;
}
