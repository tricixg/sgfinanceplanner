"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CardHeader } from "@/components/ui/CardHeader";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { EmptyState, ErrorState, SkeletonLines } from "@/components/ui/States";
import { useDomainEvent } from "@/hooks/useDomainEvent";
import { monthElapsed, monthYear } from "@/lib/dashboard/cashflow";
import type { BudgetExpenseSummary } from "@/lib/expenses/budget-summary";
import { fetchJson } from "@/lib/fetch-json";
import { fmt } from "@/lib/finance/helpers";

type Props = {
  /** Budget month (YYYY-MM) — budgets are monthly, so this is always the current month. */
  ym: string;
  todayYmd: string;
};

const MAX_ROWS = 4;

/** This month's budget utilisation, from the same summary the Expenses page uses. */
export function BudgetCard({ ym, todayYmd }: Props) {
  const [summary, setSummary] = useState<BudgetExpenseSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const { res, data } = await fetchJson<
        Partial<BudgetExpenseSummary> & { configured?: boolean; error?: string }
      >(`/api/expenses/summary?ym=${ym}`, { credentials: "include" });
      if (!res.ok) throw new Error(data.error ?? "Failed to load budget");
      setSummary(data.totals && data.categories ? (data as BudgetExpenseSummary) : null);
    } catch (e) {
      console.error("[BudgetCard] load failed", e);
      setError(e instanceof Error ? e.message : "Failed to load budget");
    } finally {
      setLoading(false);
    }
  }, [ym]);

  useEffect(() => {
    void load();
  }, [load]);

  useDomainEvent(["expense:changed", "budget:changed"], () => void load());

  const title = `Budget · ${monthYear(ym)}`;

  if (loading) {
    return (
      <div className="card" aria-busy="true">
        <CardHeader title={title} />
        <SkeletonLines lines={5} label="Loading budget" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <CardHeader title={title} href="/expenses" linkLabel="Expenses" />
        <ErrorState message={error} onRetry={() => void load()} />
      </div>
    );
  }

  const allocated = summary?.totals.allocated ?? 0;
  if (!summary || allocated <= 0) {
    return (
      <div className="card">
        <CardHeader title={title} />
        <EmptyState
          icon="wallet"
          title="No budget set"
          action={
            <Link href="/budget" className="link-more">
              Set up a budget
            </Link>
          }
        >
          Add fixed and spend categories to track how this month is going.
        </EmptyState>
      </div>
    );
  }

  const spent = summary.totals.spent;
  const remaining = summary.totals.remaining;
  const used = spent / allocated;
  const elapsed = monthElapsed(todayYmd);
  // Spending faster than the month is passing is worth a nudge before it becomes an overrun.
  const tone = used > 1 ? "over" : used > elapsed + 0.1 ? "warn" : "default";

  // Flexible "spend" categories first — those are the ones that can still be steered;
  // fixed lines sit at 100% by design. Within each group, fullest first.
  const rows = summary.categories
    .filter((c) => c.allocated > 0)
    .map((c) => ({ ...c, used: c.spent / c.allocated }))
    .sort(
      (a, b) =>
        Number(b.lineType === "spend") - Number(a.lineType === "spend") || b.used - a.used
    )
    .slice(0, MAX_ROWS);
  const overCount = summary.categories.filter(
    (c) => c.allocated > 0 && c.spent > c.allocated
  ).length;

  return (
    <div className="card">
      <CardHeader
        title={title}
        subtitle={
          overCount > 0
            ? `${overCount} ${overCount === 1 ? "category" : "categories"} over budget`
            : "All categories within budget"
        }
        href="/expenses"
        linkLabel="Expenses"
      />

      <div className="hero-label">
        <strong style={{ color: "var(--ink)", fontSize: 22, letterSpacing: "-0.02em" }}>
          {fmt(spent)}
        </strong>{" "}
        of {fmt(allocated)} used
      </div>
      <div style={{ margin: "10px 0 6px" }}>
        <ProgressBar value={used} tone={tone} label="Budget used this month" />
      </div>
      <div className="card-sub" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span>
          {Math.round(used * 100)}% used · {Math.round(elapsed * 100)}% of month gone
        </span>
        <span className={remaining < 0 ? "neg" : undefined}>
          {remaining < 0 ? `${fmt(-remaining)} over` : `${fmt(remaining)} left`}
        </span>
      </div>

      <div className="list" style={{ marginTop: 14 }}>
        {rows.map((c) => (
          <div className="list-row" key={c.budgetLineId} style={{ minHeight: 0 }}>
            <div className="list-row-main">
              <div
                style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6 }}
              >
                <span className="list-row-title">{c.category}</span>
                <span className="card-sub" style={{ margin: 0, whiteSpace: "nowrap" }}>
                  <span className={c.used > 1 ? "neg" : undefined} style={{ fontWeight: 600 }}>
                    {fmt(c.spent)}
                  </span>{" "}
                  / {fmt(c.allocated)}
                </span>
              </div>
              <ProgressBar value={c.used} size="sm" label={`${c.category} budget used`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
