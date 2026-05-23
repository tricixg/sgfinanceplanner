"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import type { AccountsBundle, UserSavingsAccount } from "@/lib/savings/types";

export function useAccounts(enabled: boolean) {
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
