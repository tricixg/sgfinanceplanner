"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { SavingsPool } from "@/lib/savings/types";
import type { FinancialAccount, UnifiedTransaction } from "@/lib/transactions/types";
import { fetchJson } from "@/lib/fetch-json";
import { fmt2 } from "@/lib/finance/helpers";

const PAGE_SIZE = 50;

function buildQuery(params: {
  accountId: string;
  poolId: string;
  financialAccountId: string;
  kind: string;
  transactionType: string;
  source: string;
  offset: number;
}): string {
  const qs = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(params.offset) });
  if (params.accountId) qs.set("accountId", params.accountId);
  if (params.poolId) qs.set("poolId", params.poolId);
  if (params.financialAccountId) qs.set("financialAccountId", params.financialAccountId);
  if (params.kind) qs.set("kind", params.kind);
  if (params.transactionType) qs.set("transactionType", params.transactionType);
  if (params.source && params.source !== "all") qs.set("source", params.source);
  return qs.toString();
}

export function TransactionsHistoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);

  const accountId = searchParams.get("accountId") ?? "";
  const poolId = searchParams.get("poolId") ?? "";
  const financialAccountId = searchParams.get("financialAccountId") ?? "";
  const kind = searchParams.get("kind") ?? "";
  const transactionType = searchParams.get("transactionType") ?? "";
  const source = searchParams.get("source") ?? "all";

  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([]);
  const [pools, setPools] = useState<SavingsPool[]>([]);
  const [items, setItems] = useState<UnifiedTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [faRes, savingsRes] = await Promise.all([
          fetchJson<{ accounts?: FinancialAccount[] }>("/api/financial-accounts", {
            credentials: "include",
          }),
          fetchJson<{ pools?: SavingsPool[] }>("/api/savings", {
            credentials: "include",
          }),
        ]);
        if (cancelled) return;
        if (faRes.res.ok) setFinancialAccounts(faRes.data.accounts ?? []);
        if (savingsRes.res.ok) setPools(savingsRes.data.pools ?? []);
        console.info("[TransactionsHistoryPage] filters loaded", {
          accounts: faRes.data.accounts?.length ?? 0,
          pools: savingsRes.data.pools?.length ?? 0,
        });
      } catch (e) {
        console.warn("[TransactionsHistoryPage] filter options failed", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(
    async (append: boolean) => {
      const nextOffset = append ? offset : 0;
      if (append) setLoadingMore(true);
      else setLoading(true);

      const qs = buildQuery({
        accountId,
        poolId,
        financialAccountId,
        kind,
        transactionType,
        source,
        offset: nextOffset,
      });

      try {
        const { res, data } = await fetchJson<{
          items?: UnifiedTransaction[];
          total?: number;
          nextOffset?: number | null;
          error?: string;
        }>(`/api/transactions?${qs}`, { credentials: "include" });

        if (!res.ok) {
          throw new Error(data.error ?? "Failed to load transactions");
        }

        const nextItems = data.items ?? [];
        setItems((prev) => (append ? [...prev, ...nextItems] : nextItems));
        setTotal(data.total ?? 0);
        if (data.nextOffset != null) setOffset(data.nextOffset);
        else if (!append) setOffset(0);

        console.info("[TransactionsHistoryPage] loaded", {
          append,
          count: nextItems.length,
          total: data.total,
        });
      } catch (e) {
        console.error("[TransactionsHistoryPage] load failed", e);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [accountId, poolId, financialAccountId, kind, transactionType, source, offset]
  );

  useEffect(() => {
    setOffset(0);
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, poolId, financialAccountId, kind, transactionType, source]);

  const hasFilters = Boolean(
    accountId || poolId || financialAccountId || kind || transactionType || source !== "all"
  );

  const selectedAccountValue = useMemo(() => {
    if (financialAccountId) return financialAccountId;
    if (accountId) {
      const fa = financialAccounts.find((a) => a.savingsAccountId === accountId);
      return fa?.id ?? "";
    }
    return "";
  }, [financialAccountId, accountId, financialAccounts]);

  const filterLabel = useMemo(() => {
    if (financialAccountId) {
      const name = financialAccounts.find((a) => a.id === financialAccountId)?.name;
      return name ? `Account: ${name}` : "Account filter";
    }
    if (accountId) {
      const fa = financialAccounts.find((a) => a.savingsAccountId === accountId);
      return fa ? `Cash: ${fa.name}` : "Savings account filter";
    }
    if (poolId) {
      const name = pools.find((p) => p.id === poolId)?.name;
      return name ? `Pool: ${name}` : "Pool filter";
    }
    return null;
  }, [financialAccountId, accountId, poolId, financialAccounts, pools]);

  const setFilters = (next: {
    accountId?: string;
    poolId?: string;
    financialAccountId?: string;
    kind?: string;
    transactionType?: string;
    source?: string;
  }) => {
    const params = new URLSearchParams();
    const a = next.accountId !== undefined ? next.accountId : accountId;
    const p = next.poolId !== undefined ? next.poolId : poolId;
    const fa =
      next.financialAccountId !== undefined ? next.financialAccountId : financialAccountId;
    const k = next.kind !== undefined ? next.kind : kind;
    const tt = next.transactionType !== undefined ? next.transactionType : transactionType;
    const src = next.source !== undefined ? next.source : source;
    if (a) params.set("accountId", a);
    if (p) params.set("poolId", p);
    if (fa) params.set("financialAccountId", fa);
    if (k) params.set("kind", k);
    if (tt) params.set("transactionType", tt);
    if (src && src !== "all") params.set("source", src);
    const path = params.toString() ? `/transactions?${params}` : "/transactions";
    router.replace(path);
  };

  const clearFilters = () => {
    router.replace("/transactions");
  };

  const onImportFile = async (file: File) => {
    setImporting(true);
    setImportMsg("");
    try {
      const csv = await file.text();
      const { res, data } = await fetchJson<{
        inserted?: number;
        skipped?: number;
        accountsCreated?: number;
        parseSkipped?: number;
        error?: string;
      }>("/api/transactions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, createMissingAccounts: true }),
      });
      if (!res.ok) {
        throw new Error(data.error ?? "Import failed");
      }
      const msg = `Imported ${data.inserted ?? 0} rows` +
        (data.accountsCreated ? ` (${data.accountsCreated} new accounts)` : "") +
        (data.skipped || data.parseSkipped
          ? ` · skipped ${(data.skipped ?? 0) + (data.parseSkipped ?? 0)}`
          : "");
      setImportMsg(msg);
      console.info("[TransactionsHistoryPage] import done", data);
      setOffset(0);
      void load(false);
      const faRes = await fetchJson<{ accounts?: FinancialAccount[] }>(
        "/api/financial-accounts",
        { credentials: "include" }
      );
      if (faRes.res.ok) setFinancialAccounts(faRes.data.accounts ?? []);
    } catch (e) {
      const err = e instanceof Error ? e.message : "Import failed";
      setImportMsg(err);
      console.error("[TransactionsHistoryPage] import failed", e);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="wrap">
      <header style={{ marginBottom: 20 }}>
        <Link href="/this-month" className="note" style={{ display: "inline-block", marginBottom: 8 }}>
          ← Back to dashboard
        </Link>
        <h1 style={{ margin: "0 0 6px", fontSize: 22 }}>Transaction history</h1>
        <p className="sub" style={{ margin: 0 }}>
          Savings ledger moves and budget imports (expenses, subscriptions, income) across cash
          accounts and credit cards.
        </p>
        {filterLabel ? (
          <p className="note" style={{ marginTop: 8 }}>
            Showing: <strong>{filterLabel}</strong>
          </p>
        ) : null}
      </header>

      <div
        className="toolbar"
        style={{ flexWrap: "wrap", marginBottom: 16, gap: 10, alignItems: "flex-end" }}
      >
        <label className="ctrl" style={{ fontSize: 13 }}>
          <span style={{ display: "block", marginBottom: 4, color: "var(--muted)" }}>
            Account
          </span>
          <select
            value={selectedAccountValue}
            onChange={(e) => {
              const id = e.target.value;
              const fa = financialAccounts.find((a) => a.id === id);
              if (fa?.savingsAccountId) {
                setFilters({
                  financialAccountId: id,
                  accountId: fa.savingsAccountId,
                  poolId: "",
                });
              } else if (fa) {
                setFilters({ financialAccountId: id, accountId: "", poolId: "" });
              } else {
                setFilters({ financialAccountId: "", accountId: "", poolId: "" });
              }
            }}
            style={{ minWidth: 180 }}
          >
            <option value="">All accounts</option>
            {financialAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.accountType === "credit_card" ? " (card)" : ""}
              </option>
            ))}
          </select>
        </label>

        {pools.length > 0 ? (
          <label className="ctrl" style={{ fontSize: 13 }}>
            <span style={{ display: "block", marginBottom: 4, color: "var(--muted)" }}>
              Shared pool
            </span>
            <select
              value={poolId}
              onChange={(e) =>
                setFilters({
                  poolId: e.target.value,
                  accountId: "",
                  financialAccountId: "",
                })
              }
              style={{ minWidth: 160 }}
            >
              <option value="">All pools</option>
              {pools.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || "Pool"}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="ctrl" style={{ fontSize: 13 }}>
          <span style={{ display: "block", marginBottom: 4, color: "var(--muted)" }}>
            Savings type
          </span>
          <select
            value={kind}
            onChange={(e) => setFilters({ kind: e.target.value })}
            style={{ minWidth: 130 }}
          >
            <option value="">Any</option>
            <option value="deposit">Deposit</option>
            <option value="withdrawal">Withdrawal</option>
            <option value="adjustment">Adjustment</option>
          </select>
        </label>

        <label className="ctrl" style={{ fontSize: 13 }}>
          <span style={{ display: "block", marginBottom: 4, color: "var(--muted)" }}>
            Budget type
          </span>
          <select
            value={transactionType}
            onChange={(e) => setFilters({ transactionType: e.target.value })}
            style={{ minWidth: 130 }}
          >
            <option value="">Any</option>
            <option value="expense">Expense</option>
            <option value="subscription">Subscription</option>
            <option value="income">Income</option>
          </select>
        </label>

        <label className="ctrl" style={{ fontSize: 13 }}>
          <span style={{ display: "block", marginBottom: 4, color: "var(--muted)" }}>
            Source
          </span>
          <select
            value={source}
            onChange={(e) => setFilters({ source: e.target.value })}
            style={{ minWidth: 120 }}
          >
            <option value="all">All</option>
            <option value="savings">Savings ledger</option>
            <option value="budget">Budget import</option>
          </select>
        </label>

        {hasFilters ? (
          <button type="button" className="btn ghost sm" onClick={clearFilters}>
            Clear filters
          </button>
        ) : null}

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImportFile(f);
          }}
        />
        <button
          type="button"
          className="btn sm"
          disabled={importing}
          onClick={() => fileRef.current?.click()}
        >
          {importing ? "Importing…" : "Import CSV"}
        </button>
      </div>

      {importMsg ? (
        <p className="note" style={{ marginBottom: 12 }}>
          {importMsg}
        </p>
      ) : null}

      <section className="panel on">
        {loading ? (
          <p className="note">Loading transactions…</p>
        ) : items.length === 0 ? (
          <p className="note">No transactions found. Import a CSV or record savings on the ME tab.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Ledger</th>
                  <th>Category</th>
                  <th>Subcategory</th>
                  <th>Transaction</th>
                  <th className="num">Amount</th>
                  <th>Account</th>
                  <th>Recorder</th>
                  <th>Tag</th>
                  <th>Note</th>
                  <th>Goal</th>
                  <th className="num">Balance</th>
                </tr>
              </thead>
              <tbody>
                {items.map((tx) => (
                  <tr key={`${tx.recordType}-${tx.id}`}>
                    <td>{tx.date}</td>
                    <td>{tx.time || "—"}</td>
                    <td>{tx.ledger || "—"}</td>
                    <td>{tx.category || "—"}</td>
                    <td>{tx.subcategory || "—"}</td>
                    <td style={{ textTransform: "capitalize" }}>{tx.typeLabel}</td>
                    <td className="num">
                      {tx.amount > 0 ? "+" : ""}
                      {fmt2(tx.amount)}
                    </td>
                    <td>{tx.accountName ?? "—"}</td>
                    <td>{tx.recorder || "—"}</td>
                    <td>{tx.tag || "—"}</td>
                    <td>{tx.note || "—"}</td>
                    <td>{tx.goalName ?? "—"}</td>
                    <td className="num">
                      {tx.balanceAfter != null ? fmt2(tx.balanceAfter) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {items.length < total ? (
          <button
            type="button"
            className="btn ghost sm"
            style={{ marginTop: 12 }}
            disabled={loadingMore}
            onClick={() => void load(true)}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        ) : null}

        {!loading && items.length > 0 ? (
          <p className="note" style={{ marginTop: 10 }}>
            Showing {items.length} of {total}
          </p>
        ) : null}
      </section>
    </div>
  );
}
