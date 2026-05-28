"use client";

import { useCallback, useEffect, useState } from "react";
import { CategoryBudgetCard } from "@/components/expenses/CategoryBudgetCard";
import { ZeroBudgetCategoryList } from "@/components/expenses/ZeroBudgetCategoryList";
import { fetchJson } from "@/lib/fetch-json";
import type { BudgetExpenseSummary } from "@/lib/expenses/budget-summary";
import { addMonthsYm } from "@/lib/finance/calendar";
import { currentYm, fmt2, formatMonthLabel } from "@/lib/finance/helpers";

export function TabExpenses({ enabled }: { enabled: boolean }) {
  const [viewYm, setViewYm] = useState(currentYm);
  const [summary, setSummary] = useState<BudgetExpenseSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadSummary = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError("");
    try {
      const { res, data } = await fetchJson<BudgetExpenseSummary & { error?: string; configured?: boolean }>(
        `/api/expenses/summary?ym=${viewYm}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to load expense summary");
      setSummary(data);
      console.info("[TabExpenses] summary loaded", {
        ym: viewYm,
        categories: data.categories?.length ?? 0,
      });
    } catch (e) {
      console.error("[TabExpenses] summary load failed", e);
      setError(e instanceof Error ? e.message : "Failed to load");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [enabled, viewYm]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const addExpense = async (payload: {
    budgetLineId: string;
    amount: number;
    spentAt: string;
    spentTime?: string;
    note: string;
    financialAccountId?: string;
  }) => {
    const { res, data } = await fetchJson<{ error?: string }>("/api/expenses", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        budgetLineId: payload.budgetLineId,
        amount: payload.amount,
        spentAt: payload.spentAt,
        ...(payload.spentTime ? { spentTime: payload.spentTime } : {}),
        note: payload.note,
        ...(payload.financialAccountId
          ? { financialAccountId: payload.financialAccountId }
          : {}),
      }),
    });
    if (!res.ok) throw new Error(data.error ?? "Failed to add expense");
    window.dispatchEvent(new Event("expenses-changed"));
    await loadSummary();
  };

  const deleteExpense = async (id: string) => {
    const { res, data } = await fetchJson<{ error?: string }>(`/api/expenses/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) throw new Error(data.error ?? "Failed to delete");
    console.info("[TabExpenses] deleted expense", { id });
    window.dispatchEvent(new Event("expenses-changed"));
    await loadSummary();
  };

  if (!enabled) {
    return (
      <section className="panel on">
        <p className="note">Sign in to track expenses in the cloud. Records stay private to you.</p>
      </section>
    );
  }

  const todayYm = currentYm();
  const totals = summary?.totals;

  return (
    <section className="panel on">
      <div className="cal-nav cal-nav--in-card" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => setViewYm((v) => addMonthsYm(v, -1))}
        >
          Prev
        </button>
        <h2>{formatMonthLabel(viewYm)}</h2>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => setViewYm((v) => addMonthsYm(v, 1))}
        >
          Next
        </button>
        {viewYm !== todayYm ? (
          <button type="button" className="btn ghost sm" onClick={() => setViewYm(todayYm)}>
            This month
          </button>
        ) : null}
      </div>

      {loading && !summary ? (
        <p className="loading">Loading expense summary…</p>
      ) : error ? (
        <p className="note">{error}</p>
      ) : summary ? (
        <>
          <div className="grid g3" style={{ marginBottom: 16 }}>
            <div className="stat accent">
              <div className="lbl">Allocated (fixed + spend)</div>
              <div className="val">{fmt2(totals?.allocated ?? 0)}</div>
            </div>
            <div className="stat">
              <div className="lbl">Used (month)</div>
              <div className="val">{fmt2(totals?.spent ?? 0)}</div>
            </div>
            <div className="stat">
              <div className="lbl">Remaining</div>
              <div className={`val ${(totals?.remaining ?? 0) < 0 ? "neg" : ""}`}>
                {fmt2(totals?.remaining ?? 0)}
              </div>
            </div>
          </div>

          {summary.categories.length === 0 && summary.zeroAllocated.length === 0 ? (
            <div className="card">
              <p className="note">
                No budget categories yet. Add fixed or spend categories on the Budget tab first.
              </p>
            </div>
          ) : null}

          <div className="category-budget-list">
            {summary.categories.map((cat) => (
              <CategoryBudgetCard
                key={cat.budgetLineId}
                category={cat}
                financialAccounts={summary.financialAccounts}
                onAddExpense={addExpense}
                onDeleteExpense={deleteExpense}
              />
            ))}
          </div>

          <ZeroBudgetCategoryList
            categories={summary.zeroAllocated}
            financialAccounts={summary.financialAccounts}
            onAddExpense={addExpense}
            onDeleteExpense={deleteExpense}
          />

          {summary.uncategorized.spent > 0 ||
          summary.uncategorized.expenses.length > 0 ||
          summary.uncategorized.imports.length > 0 ? (
            <div className="card" style={{ marginTop: 16 }}>
              <h3>Uncategorized</h3>
              <p className="note">
                Spending that does not match a budget category (fixed or spend). Total:{" "}
                {fmt2(summary.uncategorized.spent)}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Source</th>
                    <th>Category</th>
                    <th>Note</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.uncategorized.expenses.map((x) => (
                    <tr key={x.id}>
                      <td>{x.spentAt}</td>
                      <td>
                        <span className="tag">manual</span>
                      </td>
                      <td>{x.category || "—"}</td>
                      <td>{x.note || "—"}</td>
                      <td className="num">{fmt2(x.amount)}</td>
                    </tr>
                  ))}
                  {summary.uncategorized.imports.map((x) => (
                    <tr key={x.id}>
                      <td>{x.spentAt}</td>
                      <td>
                        <span className="tag t-warn">import</span>
                      </td>
                      <td>{x.category || "—"}</td>
                      <td>{x.note || "—"}</td>
                      <td className="num">{fmt2(Math.abs(x.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
