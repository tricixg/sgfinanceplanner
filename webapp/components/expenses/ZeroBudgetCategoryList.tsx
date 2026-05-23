"use client";

import { useState } from "react";
import type { CategoryBudgetSummary } from "@/lib/expenses/budget-summary";
import { fmt2 } from "@/lib/finance/helpers";
import { PayFromAccountSelect } from "@/components/expenses/PayFromAccountSelect";
import type { FinancialAccount } from "@/lib/transactions/types";

type Props = {
  category: CategoryBudgetSummary;
  financialAccounts?: FinancialAccount[];
  onAddExpense: (payload: {
    budgetLineId: string;
    amount: number;
    spentAt: string;
    note: string;
    financialAccountId?: string;
  }) => Promise<void>;
  onDeleteExpense: (id: string) => Promise<void>;
};

export function ZeroBudgetCategoryItem({
  category,
  financialAccounts,
  onAddExpense,
  onDeleteExpense,
}: Props) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [spentAt, setSpentAt] = useState(new Date().toISOString().slice(0, 10));
  const [financialAccountId, setFinancialAccountId] = useState("");
  const [saving, setSaving] = useState(false);

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
    } finally {
      setSaving(false);
    }
  };

  return (
    <details className="zero-budget-item">
      <summary className="zero-budget-item-summary">
        <span className="zero-budget-item-name">{category.category || "Unnamed"}</span>
        <span className="zero-budget-item-meta">
          used {category.spent > 0 ? fmt2(category.spent) : "—"}
        </span>
      </summary>
      <div className="zero-budget-item-body">
        <form className="zero-budget-item-add" onSubmit={(e) => void handleSubmit(e)}>
          <input type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} />
          <input
            type="number"
            step={0.01}
            min={0}
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <PayFromAccountSelect
            value={financialAccountId}
            onChange={setFinancialAccountId}
            accounts={financialAccounts}
          />
          <button type="submit" className="btn ghost sm" disabled={saving}>
            {saving ? "…" : "Add"}
          </button>
        </form>
        {rows.length > 0 ? (
          <ul className="zero-budget-item-txs">
            {rows.map((r) => (
              <li key={`${r.kind}-${r.id}`}>
                <span className="zero-budget-item-tx-date">{r.date.slice(5)}</span>
                <span className="zero-budget-item-tx-amt">{fmt2(r.amount)}</span>
                {r.note ? <span className="zero-budget-item-tx-note">{r.note}</span> : null}
                {r.kind === "import" ? <span className="tag t-warn">import</span> : null}
                {r.kind === "manual" ? (
                  <button
                    type="button"
                    className="btn ghost sm zero-budget-item-del"
                    onClick={() => void onDeleteExpense(r.id)}
                  >
                    ×
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </details>
  );
}

export function ZeroBudgetCategoryList({
  categories,
  financialAccounts,
  onAddExpense,
  onDeleteExpense,
}: {
  categories: CategoryBudgetSummary[];
  financialAccounts?: FinancialAccount[];
  onAddExpense: Props["onAddExpense"];
  onDeleteExpense: Props["onDeleteExpense"];
}) {
  if (categories.length === 0) return null;

  return (
    <details className="category-budget-zero">
      <summary>
        $0 budget · {categories.length} categor{categories.length === 1 ? "y" : "ies"}
      </summary>
      <div className="zero-budget-list">
        {categories.map((cat) => (
          <ZeroBudgetCategoryItem
            key={cat.budgetLineId}
            category={cat}
            financialAccounts={financialAccounts}
            onAddExpense={onAddExpense}
            onDeleteExpense={onDeleteExpense}
          />
        ))}
      </div>
    </details>
  );
}
