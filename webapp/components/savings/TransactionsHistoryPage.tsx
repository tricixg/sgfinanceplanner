"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { UnifiedTransaction } from "@/lib/transactions/types";
import { fetchJson } from "@/lib/fetch-json";
import { fmtSigned2, fmt2 } from "@/lib/finance/helpers";
import { useSavings } from "@/hooks/useSavings";
import { useFinancialAccounts } from "@/hooks/useFinancialAccounts";

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

  const [items, setItems] = useState<UnifiedTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");

  const { bundle: savingsBundle } = useSavings();
  const { accounts: financialAccounts, reload: reloadFinancialAccounts } =
    useFinancialAccounts();
  const pools = savingsBundle.pools;

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
      await reloadFinancialAccounts();
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
    <>
      <div className="tx-filters">
        <label className="tx-filter">
          <span className="tx-filter-label">Account</span>
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
          >
            <option value="">All</option>
            {financialAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.accountType === "credit_card" ? " (card)" : ""}
              </option>
            ))}
          </select>
        </label>

        {pools.length > 0 ? (
          <label className="tx-filter">
            <span className="tx-filter-label">Pool</span>
            <select
              value={poolId}
              onChange={(e) =>
                setFilters({
                  poolId: e.target.value,
                  accountId: "",
                  financialAccountId: "",
                })
              }
            >
              <option value="">All</option>
              {pools.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || "Pool"}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="tx-filter">
          <span className="tx-filter-label">Savings</span>
          <select value={kind} onChange={(e) => setFilters({ kind: e.target.value })}>
            <option value="">Any</option>
            <option value="deposit">Deposit</option>
            <option value="withdrawal">Withdrawal</option>
            <option value="adjustment">Adjustment</option>
          </select>
        </label>

        <label className="tx-filter">
          <span className="tx-filter-label">Budget</span>
          <select
            value={transactionType}
            onChange={(e) => setFilters({ transactionType: e.target.value })}
          >
            <option value="">Any</option>
            <option value="expense">Expense</option>
            <option value="subscription">Subscription</option>
            <option value="income">Income</option>
          </select>
        </label>

        <label className="tx-filter">
          <span className="tx-filter-label">Source</span>
          <select value={source} onChange={(e) => setFilters({ source: e.target.value })}>
            <option value="all">All</option>
            <option value="savings">Ledger</option>
            <option value="budget">Import</option>
            <option value="expense">Recorded</option>
          </select>
        </label>

        <div className="tx-filters-actions">
          {hasFilters ? (
            <button type="button" className="btn ghost sm" onClick={clearFilters}>
              Clear
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
          <p className="note">No transactions found. Import a CSV, record savings on Cash Accounts, or log expenses and recurring payments.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Ledger</th>
                  <th>Category</th>
                  <th>Transaction</th>
                  <th className="num">Amount</th>
                  <th>Account</th>
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
                    <td style={{ textTransform: "capitalize" }}>{tx.typeLabel}</td>
                    <td className="num">{fmtSigned2(tx.amount)}</td>
                    <td>{tx.accountName ?? "—"}</td>
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
    </>
  );
}
