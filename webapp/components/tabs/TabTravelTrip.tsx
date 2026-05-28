"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DecimalTextInput } from "@/components/DecimalInput";
import { useFinancialAccounts } from "@/hooks/useFinancialAccounts";
import { fmt2 } from "@/lib/finance/helpers";
import { fetchJson } from "@/lib/fetch-json";
import type { TravelExpenseRow, TravelTrip, TravelTripBudget } from "@/lib/travel/types";

type Props = { tripId: string; enabled: boolean };

type BudgetDraft = {
  id?: string;
  subCategory: string;
  budgetAmount: number;
};

export function TabTravelTrip({ tripId, enabled }: Props) {
  const [trip, setTrip] = useState<TravelTrip | null>(null);
  const [budgets, setBudgets] = useState<TravelTripBudget[]>([]);
  const [expenses, setExpenses] = useState<TravelExpenseRow[]>([]);
  const [draft, setDraft] = useState<BudgetDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingBudget, setSavingBudget] = useState(false);
  const [msg, setMsg] = useState("");

  const { accounts } = useFinancialAccounts();
  const [subCategory, setSubCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [spentAt, setSpentAt] = useState("");
  const [note, setNote] = useState("");
  const [financialAccountId, setFinancialAccountId] = useState("");
  const [savingExpense, setSavingExpense] = useState(false);

  const load = async () => {
    setLoading(true);
    const [tripRes, budgetRes, expenseRes] = await Promise.all([
      fetchJson<{ item?: TravelTrip; error?: string }>(`/api/travel/trips/${tripId}`, {
        credentials: "include",
      }),
      fetchJson<{ items?: TravelTripBudget[]; error?: string }>(
        `/api/travel/trips/${tripId}/budgets`,
        { credentials: "include" }
      ),
      fetchJson<{ items?: TravelExpenseRow[]; error?: string }>(
        `/api/travel/trips/${tripId}/expenses`,
        { credentials: "include" }
      ),
    ]);
    if (!tripRes.res.ok) {
      setMsg(tripRes.data.error ?? "Failed to load trip");
      setTrip(null);
    } else {
      setTrip(tripRes.data.item ?? null);
    }
    if (budgetRes.res.ok) {
      const next = budgetRes.data.items ?? [];
      setBudgets(next);
      setDraft(next.map((b) => ({ id: b.id, subCategory: b.subCategory, budgetAmount: b.budgetAmount })));
      if (!subCategory && next.length > 0) setSubCategory(next[0]!.subCategory);
    }
    if (expenseRes.res.ok) {
      setExpenses(expenseRes.data.items ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!enabled) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tripId]);

  const saveBudgets = async () => {
    setSavingBudget(true);
    setMsg("");
    const payload = draft
      .map((d) => ({
        id: d.id,
        subCategory: d.subCategory.trim(),
        budgetAmount: d.budgetAmount,
      }))
      .filter((d) => d.subCategory.length > 0);
    const { res, data } = await fetchJson<{ items?: TravelTripBudget[]; error?: string }>(
      `/api/travel/trips/${tripId}/budgets`,
      {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payload }),
      }
    );
    setSavingBudget(false);
    if (!res.ok) {
      setMsg(data.error ?? "Failed to save budgets");
      return;
    }
    const next = data.items ?? [];
    setBudgets(next);
    setDraft(next.map((b) => ({ id: b.id, subCategory: b.subCategory, budgetAmount: b.budgetAmount })));
    if (!subCategory && next.length > 0) setSubCategory(next[0]!.subCategory);
  };

  const addExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!(amt > 0) || !spentAt || !subCategory.trim()) {
      setMsg("Choose subcategory, date, and amount");
      return;
    }
    setSavingExpense(true);
    setMsg("");
    const { res, data } = await fetchJson<{ error?: string }>(
      `/api/travel/trips/${tripId}/expenses`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amt,
          spentAt,
          subCategory,
          note,
          financialAccountId: financialAccountId || undefined,
        }),
      }
    );
    setSavingExpense(false);
    if (!res.ok) {
      setMsg(data.error ?? "Failed to add expense");
      return;
    }
    setAmount("");
    setNote("");
    await load();
  };

  const spentBySub = useMemo(() => {
    const out = new Map<string, number>();
    for (const e of expenses) {
      out.set(e.subCategory, (out.get(e.subCategory) ?? 0) + e.amount);
    }
    return out;
  }, [expenses]);

  if (!enabled) {
    return (
      <section className="panel on">
        <p className="note">Sign in to view this trip.</p>
      </section>
    );
  }

  return (
    <section className="panel on">
      <div className="section-head">
        <h2>{trip ? `${trip.name} (${trip.country})` : "Trip"}</h2>
        <Link href="/travel" className="btn ghost sm">
          Back to Travel
        </Link>
      </div>

      {loading ? <p className="note">Loading…</p> : null}

      <div className="card">
        <div className="section-head">
          <h3>Budget</h3>
          <button type="button" className="btn sm" disabled={savingBudget} onClick={() => void saveBudgets()}>
            {savingBudget ? "Saving…" : "Save budget"}
          </button>
        </div>
        {draft.length === 0 ? <p className="note">No budget categories yet.</p> : null}
        {draft.map((row, i) => (
          <div className="editrow" key={`${row.id ?? "new"}-${i}`} style={{ gridTemplateColumns: "1.4fr 0.9fr auto" }}>
            <input
              type="text"
              value={row.subCategory}
              onChange={(e) =>
                setDraft((prev) =>
                  prev.map((r, idx) => (idx === i ? { ...r, subCategory: e.target.value } : r))
                )
              }
              placeholder="Subcategory"
            />
            <DecimalTextInput
              value={String(row.budgetAmount)}
              onChange={(v) =>
                setDraft((prev) =>
                  prev.map((r, idx) =>
                    idx === i ? { ...r, budgetAmount: Number(parseFloat(v) || 0) } : r
                  )
                )
              }
            />
            <button
              type="button"
              className="btn del sm"
              onClick={() => setDraft((prev) => prev.filter((_, idx) => idx !== i))}
            >
              del
            </button>
          </div>
        ))}
        <div className="toolbar">
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => setDraft((prev) => [...prev, { subCategory: "", budgetAmount: 0 }])}
          >
            + Add category
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Add expense</h3>
        <form className="editrow" style={{ gridTemplateColumns: "1fr 0.9fr 0.9fr 1.2fr 1fr auto" }} onSubmit={(e) => void addExpense(e)}>
          <select value={subCategory} onChange={(e) => setSubCategory(e.target.value)}>
            <option value="">Subcategory…</option>
            {budgets.map((b) => (
              <option key={b.id} value={b.subCategory}>
                {b.subCategory}
              </option>
            ))}
          </select>
          <input type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} />
          <DecimalTextInput value={amount} onChange={setAmount} />
          <input
            type="text"
            placeholder="Optional note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <select
            value={financialAccountId}
            onChange={(e) => setFinancialAccountId(e.target.value)}
            aria-label="Pay from account"
          >
            <option value="">Pay from…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn sm" disabled={savingExpense}>
            {savingExpense ? "Adding…" : "Add"}
          </button>
        </form>
      </div>

      <div className="card table-scroll">
        <table>
          <thead>
            <tr>
              <th>Subcategory</th>
              <th className="num">Budget</th>
              <th className="num">Spent</th>
              <th className="num">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {budgets.length === 0 ? (
              <tr>
                <td colSpan={4} className="note">
                  Add budget categories first.
                </td>
              </tr>
            ) : (
              budgets.map((b) => {
                const spent = spentBySub.get(b.subCategory) ?? 0;
                const remaining = b.budgetAmount - spent;
                return (
                  <tr key={b.id}>
                    <td>{b.subCategory}</td>
                    <td className="num">{fmt2(b.budgetAmount)}</td>
                    <td className="num">{fmt2(spent)}</td>
                    <td className={`num ${remaining < 0 ? "neg" : ""}`}>{fmt2(remaining)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {msg ? <p className="note">{msg}</p> : null}
    </section>
  );
}
