"use client";

import { useState } from "react";
import type { CategoryBudgetSummary } from "@/lib/expenses/budget-summary";
import { fmt2 } from "@/lib/finance/helpers";
import { PayFromAccountSelect } from "@/components/expenses/PayFromAccountSelect";

type Props = {
  category: CategoryBudgetSummary;
  compact?: boolean;
  onAddExpense: (payload: {
    budgetLineId: string;
    amount: number;
    spentAt: string;
    note: string;
    financialAccountId?: string;
  }) => Promise<void>;
  onDeleteExpense: (id: string) => Promise<void>;
};

function progressPct(spent: number, allocated: number): number {
  if (allocated <= 0) return spent > 0 ? 100 : 0;
  return Math.min(100, (spent / allocated) * 100);
}

export function CategoryBudgetCard({
  category,
  compact = false,
  onAddExpense,
  onDeleteExpense,
}: Props) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [spentAt, setSpentAt] = useState(new Date().toISOString().slice(0, 10));
  const [financialAccountId, setFinancialAccountId] = useState("");
  const [saving, setSaving] = useState(false);

  const over = category.allocated > 0 && category.spent > category.allocated;
  const pct = progressPct(category.spent, category.allocated);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    setSaving(true);
    try {
      await onAddExpense({
        budgetLineId: category.budgetLineId,
        amount: amt,
        spentAt,
        note,
        financialAccountId: financialAccountId || undefined,
      });
      setAmount("");
      setNote("");
      console.info("[CategoryBudgetCard] expense added", {
        budgetLineId: category.budgetLineId,
        amount: amt,
      });
    } finally {
      setSaving(false);
    }
  };

  const rows = [
    ...category.expenses.map((x) => ({
      id: x.id,
      kind: "manual" as const,
      date: x.spentAt,
      amount: x.amount,
      note: x.note,
    })),
    ...category.imports.map((x) => ({
      id: x.id,
      kind: "import" as const,
      date: x.spentAt,
      amount: Math.abs(x.amount),
      note: x.note,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className={`card category-budget-card ${compact ? "category-budget-card--compact" : ""}`}>
      <div className="category-budget-head">
        <div>
          <h3 className="category-budget-title">{category.category || "Unnamed"}</h3>
          <span className={`tag ${category.lineType === "fixed" ? "t-soon" : "t-ok"}`}>
            {category.lineType}
          </span>
        </div>
        <div className="category-budget-stats">
          <span>
            <span className="lbl">Allocated</span> {fmt2(category.allocated)}
          </span>
          <span>
            <span className="lbl">Used (month)</span> {fmt2(category.spent)}
          </span>
          <span className={category.remaining < 0 ? "neg" : ""}>
            <span className="lbl">Remaining</span> {fmt2(category.remaining)}
          </span>
        </div>
      </div>

      {category.allocated > 0 ? (
        <div className="category-budget-progress-wrap">
          <div
            className={`category-budget-progress ${over ? "category-budget-progress--over" : ""}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}

      <form className="category-budget-add" onSubmit={(e) => void handleSubmit(e)}>
        <label>
          Date
          <input type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} />
        </label>
        <label>
          Amount
          <input
            type="number"
            step={0.01}
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>
        {!compact ? (
          <label>
            Note
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        ) : null}
        <label>
          Pay from
          <PayFromAccountSelect
            value={financialAccountId}
            onChange={setFinancialAccountId}
          />
        </label>
        <button type="submit" className="btn sm" disabled={saving}>
          {saving ? "Adding…" : "Add"}
        </button>
      </form>

      {rows.length > 0 ? (
        <table className="category-budget-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Source</th>
              <th>Note</th>
              <th>Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.kind}-${r.id}`}>
                <td>{r.date}</td>
                <td>
                  <span className={`tag ${r.kind === "import" ? "t-warn" : ""}`}>
                    {r.kind === "import" ? "import" : "manual"}
                  </span>
                </td>
                <td>{r.note || "—"}</td>
                <td className="num">{fmt2(r.amount)}</td>
                <td>
                  {r.kind === "manual" ? (
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => void onDeleteExpense(r.id)}
                    >
                      Delete
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="note category-budget-empty">No spending this month.</p>
      )}
    </div>
  );
}
