"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { UnifiedTransaction } from "@/lib/transactions/types";
import { UNCATEGORIZED_CATEGORY_FILTER } from "@/lib/transactions/types";
import { fetchJson } from "@/lib/fetch-json";
import { fmtSigned2, fmt2 } from "@/lib/finance/helpers";
import { useFinancialAccounts } from "@/hooks/useFinancialAccounts";
import { useDomainEvent } from "@/hooks/useDomainEvent";
import { sgtTodayYmd, sgtYmdDaysAgo } from "@/lib/time/sgt";
import { Snackbar } from "@/components/Snackbar";
import { useSnackbar } from "@/hooks/useSnackbar";
import { TransactionActionModal } from "@/components/savings/TransactionActionModal";

const PAGE_SIZE = 50;

type PeriodPreset = "" | "this_month" | "last_30" | "last_90" | "custom";

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

function isoTodaySgt(): string {
  return sgtTodayYmd();
}

function isoDaysAgoSgt(days: number): string {
  return sgtYmdDaysAgo(days);
}

function isoMonthStartSgt(): string {
  const today = sgtTodayYmd();
  return `${today.slice(0, 7)}-01`;
}

function periodToRange(period: Exclude<PeriodPreset, "" | "custom">): {
  dateFrom: string;
  dateTo: string;
} {
  const today = isoTodaySgt();
  if (period === "this_month") {
    return { dateFrom: isoMonthStartSgt(), dateTo: today };
  }
  if (period === "last_30") {
    return { dateFrom: isoDaysAgoSgt(29), dateTo: today };
  }
  return { dateFrom: isoDaysAgoSgt(89), dateTo: today };
}

function detectPeriod(dateFrom: string, dateTo: string): PeriodPreset {
  if (!dateFrom && !dateTo) return "";
  for (const preset of ["this_month", "last_30", "last_90"] as const) {
    const range = periodToRange(preset);
    if (range.dateFrom === dateFrom && range.dateTo === dateTo) return preset;
  }
  return "custom";
}

function buildQuery(params: {
  accountId: string;
  financialAccountId: string;
  type: string;
  source: string;
  category: string;
  dateFrom: string;
  dateTo: string;
  offset: number;
}): string {
  const qs = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(params.offset) });
  if (params.accountId) qs.set("accountId", params.accountId);
  if (params.financialAccountId) qs.set("financialAccountId", params.financialAccountId);
  const { kind, transactionType } = splitTypeFilter(params.type);
  if (kind) qs.set("kind", kind);
  if (transactionType) qs.set("transactionType", transactionType);
  if (params.source && params.source !== "all") qs.set("source", params.source);
  if (params.category) qs.set("category", params.category);
  if (params.dateFrom) qs.set("dateFrom", params.dateFrom);
  if (params.dateTo) qs.set("dateTo", params.dateTo);
  return qs.toString();
}

export function TransactionsHistoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const accountId = searchParams.get("accountId") ?? "";
  const financialAccountId = searchParams.get("financialAccountId") ?? "";
  const type = readTypeFromSearchParams(searchParams);
  const source = searchParams.get("source") ?? "all";
  const category = searchParams.get("category") ?? "";
  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo = searchParams.get("dateTo") ?? "";
  const period = detectPeriod(dateFrom, dateTo);

  const [items, setItems] = useState<UnifiedTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [amountTotal, setAmountTotal] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedTx, setSelectedTx] = useState<UnifiedTransaction | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const snackbar = useSnackbar();

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
        category,
        dateFrom,
        dateTo,
        offset: nextOffset,
      });

      try {
        const { res, data } = await fetchJson<{
          items?: UnifiedTransaction[];
          total?: number;
          nextOffset?: number | null;
          amountTotal?: number | null;
          error?: string;
        }>(`/api/transactions?${qs}`, { credentials: "include" });

        if (!res.ok) {
          throw new Error(data.error ?? "Failed to load transactions");
        }

        const nextItems = data.items ?? [];
        setItems((prev) => (append ? [...prev, ...nextItems] : nextItems));
        setTotal(data.total ?? 0);
        setAmountTotal(data.amountTotal ?? null);
        if (data.nextOffset != null) setOffset(data.nextOffset);
        else if (!append) setOffset(0);

        console.info("[TransactionsHistoryPage] loaded", {
          append,
          count: nextItems.length,
          total: data.total,
          amountTotal: data.amountTotal,
        });
      } catch (e) {
        console.error("[TransactionsHistoryPage] load failed", e);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [accountId, effectiveFinancialAccountId, type, source, category, dateFrom, dateTo, offset]
  );

  const loadCategoryOptions = useCallback(async () => {
    try {
      const { res, data } = await fetchJson<{ categories?: string[]; error?: string }>(
        "/api/transactions/categories",
        { credentials: "include" }
      );
      if (res.ok) setCategoryOptions(data.categories ?? []);
    } catch (e) {
      console.error("[TransactionsHistoryPage] category options load failed", e);
    }
  }, []);

  useEffect(() => {
    void loadCategoryOptions();
  }, [loadCategoryOptions]);

  useEffect(() => {
    setOffset(0);
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, effectiveFinancialAccountId, type, source, category, dateFrom, dateTo]);

  useDomainEvent(
    ["expense:changed", "savings:changed", "accounts:changed"],
    () => {
      setOffset(0);
      void load(false);
      void loadCategoryOptions();
    }
  );

  const hasFilters = Boolean(
    accountId ||
      financialAccountId ||
      type ||
      source !== "all" ||
      category ||
      dateFrom ||
      dateTo
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
    category?: string;
    dateFrom?: string;
    dateTo?: string;
  }) => {
    const params = new URLSearchParams();
    const a = next.accountId !== undefined ? next.accountId : accountId;
    const fa =
      next.financialAccountId !== undefined ? next.financialAccountId : financialAccountId;
    const t = next.type !== undefined ? next.type : type;
    const src = next.source !== undefined ? next.source : source;
    const cat = next.category !== undefined ? next.category : category;
    const from = next.dateFrom !== undefined ? next.dateFrom : dateFrom;
    const to = next.dateTo !== undefined ? next.dateTo : dateTo;
    if (a) params.set("accountId", a);
    if (fa) params.set("financialAccountId", fa);
    if (t) params.set("type", t);
    if (src && src !== "all") params.set("source", src);
    if (cat) params.set("category", cat);
    if (from) params.set("dateFrom", from);
    if (to) params.set("dateTo", to);
    const path = params.toString() ? `/transactions?${params}` : "/transactions";
    router.replace(path);
  };

  const setPeriod = (nextPeriod: PeriodPreset) => {
    if (!nextPeriod) {
      setFilters({ dateFrom: "", dateTo: "" });
      return;
    }
    if (nextPeriod === "custom") {
      console.info("[TransactionsHistoryPage] custom date range");
      if (!dateFrom && !dateTo) {
        const today = isoTodaySgt();
        setFilters({ dateFrom: today, dateTo: today });
      }
      return;
    }
    const range = periodToRange(nextPeriod);
    console.info("[TransactionsHistoryPage] period preset", { nextPeriod, ...range });
    setFilters({ dateFrom: range.dateFrom, dateTo: range.dateTo });
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
            <option value="budget">Budget</option>
            <option value="expense">Recorded</option>
          </select>
        </label>

        <label className="tx-filter">
          <span className="tx-filter-label">Category</span>
          <select value={category} onChange={(e) => setFilters({ category: e.target.value })}>
            <option value="">All</option>
            <option value={UNCATEGORIZED_CATEGORY_FILTER}>Uncategorized</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="tx-filter">
          <span className="tx-filter-label">Period</span>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodPreset)}
          >
            <option value="">Any</option>
            <option value="this_month">This month</option>
            <option value="last_30">Last 30 days</option>
            <option value="last_90">Last 90 days</option>
            <option value="custom">Custom range</option>
          </select>
        </label>

        <label className="tx-filter">
          <span className="tx-filter-label">From</span>
          <input
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) =>
              setFilters({
                dateFrom: e.target.value,
                dateTo: dateTo && e.target.value > dateTo ? e.target.value : dateTo,
              })
            }
          />
        </label>
        <label className="tx-filter">
          <span className="tx-filter-label">To</span>
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => setFilters({ dateTo: e.target.value })}
          />
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
                  <tr
                    key={`${tx.recordType}-${tx.id}`}
                    style={{ cursor: "pointer" }}
                    onClick={() => setSelectedTx(tx)}
                  >
                    <td>{tx.date}</td>
                    <td>{tx.time || "—"}</td>
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
              {hasFilters && amountTotal != null ? (
                <tfoot>
                  <tr>
                    <th colSpan={4}>Total ({total})</th>
                    <th className="num">{fmtSigned2(amountTotal)}</th>
                    <th colSpan={4} />
                  </tr>
                </tfoot>
              ) : null}
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
      {selectedTx ? (
        <TransactionActionModal
          tx={selectedTx}
          onClose={() => setSelectedTx(null)}
          onSaved={(m) => {
            setSelectedTx(null);
            snackbar.show(m);
            void load(false);
          }}
        />
      ) : null}
      <Snackbar
        message={snackbar.message}
        variant={snackbar.variant}
        durationMs={snackbar.durationMs}
        onDismiss={snackbar.dismiss}
      />
    </>
  );
}
