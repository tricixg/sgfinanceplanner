"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { UnifiedTransaction } from "@/lib/transactions/types";
import { fetchJson } from "@/lib/fetch-json";
import { fmtSigned2, fmt2 } from "@/lib/finance/helpers";
import { useFinancialAccounts } from "@/hooks/useFinancialAccounts";

const PAGE_SIZE = 50;

const SAVINGS_TYPES = ["deposit", "withdrawal", "adjustment"] as const;
const BUDGET_TYPES = ["expense", "subscription", "income"] as const;

function splitTypeFilter(type: string): { kind?: string; transactionType?: string } {
  if (!type) return {};
  if ((SAVINGS_TYPES as readonly string[]).includes(type)) return { kind: type };
  if ((BUDGET_TYPES as readonly string[]).includes(type)) return { transactionType: type };
  return {};
}

function readTypeFromSearchParams(searchParams: URLSearchParams): string {
  const type = searchParams.get("type")?.trim() ?? "";
  if (type) return type;
  const kind = searchParams.get("kind")?.trim() ?? "";
  if (kind) return kind;
  return searchParams.get("transactionType")?.trim() ?? "";
}

function buildQuery(params: {
  accountId: string;
  financialAccountId: string;
  type: string;
  source: string;
  offset: number;
}): string {
  const qs = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(params.offset) });
  if (params.accountId) qs.set("accountId", params.accountId);
  if (params.financialAccountId) qs.set("financialAccountId", params.financialAccountId);
  const { kind, transactionType } = splitTypeFilter(params.type);
  if (kind) qs.set("kind", kind);
  if (transactionType) qs.set("transactionType", transactionType);
  if (params.source && params.source !== "all") qs.set("source", params.source);
  return qs.toString();
}

export function TransactionsHistoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const accountId = searchParams.get("accountId") ?? "";
  const financialAccountId = searchParams.get("financialAccountId") ?? "";
  const type = readTypeFromSearchParams(searchParams);
  const source = searchParams.get("source") ?? "all";

  const [items, setItems] = useState<UnifiedTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const { accounts: financialAccounts } = useFinancialAccounts();

  const effectiveFinancialAccountId = useMemo(() => {
    if (financialAccountId) return financialAccountId;
    if (!accountId) return "";
    return financialAccounts.find((a) => a.savingsAccountId === accountId)?.id ?? "";
  }, [financialAccountId, accountId, financialAccounts]);

  const load = useCallback(
    async (append: boolean) => {
      const nextOffset = append ? offset : 0;
      if (append) setLoadingMore(true);
      else setLoading(true);

      const qs = buildQuery({
        accountId,
        financialAccountId: effectiveFinancialAccountId,
        type,
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
    [accountId, effectiveFinancialAccountId, type, source, offset]
  );

  useEffect(() => {
    setOffset(0);
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, effectiveFinancialAccountId, type, source]);

  const hasFilters = Boolean(
    accountId || financialAccountId || type || source !== "all"
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
    financialAccountId?: string;
    type?: string;
    source?: string;
  }) => {
    const params = new URLSearchParams();
    const a = next.accountId !== undefined ? next.accountId : accountId;
    const fa =
      next.financialAccountId !== undefined ? next.financialAccountId : financialAccountId;
    const t = next.type !== undefined ? next.type : type;
    const src = next.source !== undefined ? next.source : source;
    if (a) params.set("accountId", a);
    if (fa) params.set("financialAccountId", fa);
    if (t) params.set("type", t);
    if (src && src !== "all") params.set("source", src);
    const path = params.toString() ? `/transactions?${params}` : "/transactions";
    router.replace(path);
  };

  const clearFilters = () => {
    router.replace("/transactions");
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
                });
              } else if (fa) {
                setFilters({ financialAccountId: id, accountId: "" });
              } else {
                setFilters({ financialAccountId: "", accountId: "" });
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

        <label className="tx-filter">
          <span className="tx-filter-label">Transaction type</span>
          <select value={type} onChange={(e) => setFilters({ type: e.target.value })}>
            <option value="">Any</option>
            <option value="deposit">Deposit</option>
            <option value="withdrawal">Withdrawal</option>
            <option value="adjustment">Adjustment</option>
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

        {hasFilters ? (
          <div className="tx-filters-actions">
            <button type="button" className="btn ghost sm" onClick={clearFilters}>
              Clear
            </button>
          </div>
        ) : null}
      </div>

      <section className="panel on">
        {loading ? (
          <p className="note">Loading transactions…</p>
        ) : items.length === 0 ? (
          <p className="note">
            No transactions found. Record savings on Cash Accounts, or log expenses and recurring
            payments.
          </p>
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
