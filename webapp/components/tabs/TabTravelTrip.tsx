"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChartBox } from "@/components/ChartBox";
import { DecimalTextInput } from "@/components/DecimalInput";
import { InlineConfirm } from "@/components/InlineConfirm";
import { Snackbar } from "@/components/Snackbar";
import { TravelExpenseActionModal } from "@/components/travel/TravelExpenseActionModal";
import { useFinancialAccounts } from "@/hooks/useFinancialAccounts";
import { useSnackbar } from "@/hooks/useSnackbar";
import { fmt2 } from "@/lib/finance/helpers";
import { fetchJson } from "@/lib/fetch-json";
import { dispatchDomainEvent } from "@/lib/events/domain-events";
import { formatTravelSpentAtTable } from "@/lib/travel/expense-input";
import { sgtNowInputDateTime } from "@/lib/time/sgt";
import type { TravelExpenseRow, TravelTrip, TravelTripBudget } from "@/lib/travel/types";

type Props = { tripId: string; enabled: boolean };

type BudgetDraft = {
  id?: string;
  subCategory: string;
  budgetAmount: number;
};

export function TabTravelTrip({ tripId, enabled }: Props) {
  const router = useRouter();
  const [trip, setTrip] = useState<TravelTrip | null>(null);
  const [budgets, setBudgets] = useState<TravelTripBudget[]>([]);
  const [expenses, setExpenses] = useState<TravelExpenseRow[]>([]);
  const [draft, setDraft] = useState<BudgetDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingBudget, setSavingBudget] = useState(false);
  const [editingBudget, setEditingBudget] = useState(false);
  const [msg, setMsg] = useState("");

  const { accounts } = useFinancialAccounts();
  const [subCategory, setSubCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [spentAt, setSpentAt] = useState(() => sgtNowInputDateTime());
  const [note, setNote] = useState("");
  const [financialAccountId, setFinancialAccountId] = useState("");
  const [savingExpense, setSavingExpense] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<TravelExpenseRow | null>(null);
  const snackbar = useSnackbar();
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteTrip, setConfirmDeleteTrip] = useState(false);
  const [editingTrip, setEditingTrip] = useState(false);
  const [savingTrip, setSavingTrip] = useState(false);
  const [tripDraft, setTripDraft] = useState({
    name: "",
    country: "",
    startDate: "",
    endDate: "",
  });

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
      const item = tripRes.data.item ?? null;
      setTrip(item);
      if (!editingTrip && item) {
        setTripDraft({
          name: item.name,
          country: item.country,
          startDate: item.startDate,
          endDate: item.endDate,
        });
      }
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
  }, [enabled, tripId, editingTrip]);

  const saveTripMeta = async () => {
    if (!trip) return;
    const name = tripDraft.name.trim();
    const country = tripDraft.country.trim();
    const startDate = tripDraft.startDate;
    const endDate = tripDraft.endDate;
    if (!name || !country || !startDate || !endDate) {
      setMsg("Name, country, start date, and end date are required");
      return;
    }
    if (startDate > endDate) {
      setMsg("Start date must be on or before end date");
      return;
    }

    setSavingTrip(true);
    setMsg("");
    const { res, data } = await fetchJson<{ item?: TravelTrip; error?: string }>(
      `/api/travel/trips/${tripId}`,
      {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          country,
          startDate,
          endDate,
        }),
      }
    );
    setSavingTrip(false);
    if (!res.ok || !data.item) {
      setMsg(data.error ?? "Failed to save trip");
      return;
    }

    setTrip(data.item);
    setTripDraft({
      name: data.item.name,
      country: data.item.country,
      startDate: data.item.startDate,
      endDate: data.item.endDate,
    });
    setEditingTrip(false);
    await load();
  };

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
    setEditingBudget(false);
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
    dispatchDomainEvent(["expense:changed", "accounts:changed"]);
    await load();
  };

  const budgetSubCategories = useMemo(
    () => budgets.map((b) => b.subCategory),
    [budgets]
  );

  const spentBySub = useMemo(() => {
    const out = new Map<string, number>();
    for (const e of expenses) {
      out.set(e.subCategory, (out.get(e.subCategory) ?? 0) + e.amount);
    }
    return out;
  }, [expenses]);

  const totals = useMemo(() => {
    const rows = editingBudget ? draft : budgets;
    let budgetTotal = 0;
    let spentTotal = 0;
    for (const row of rows) {
      const budgetAmount = Number(row.budgetAmount ?? 0);
      const spent = Number(spentBySub.get(row.subCategory) ?? 0);
      budgetTotal += budgetAmount;
      spentTotal += spent;
    }
    return {
      budget: budgetTotal,
      spent: spentTotal,
      remaining: budgetTotal - spentTotal,
    };
  }, [editingBudget, draft, budgets, spentBySub]);

  const budgetPie = useMemo(() => {
    const rows = (editingBudget ? draft : budgets).filter(
      (row) => row.subCategory.trim().length > 0 && Number(row.budgetAmount ?? 0) > 0
    );
    if (rows.length === 0) return null;
    const labels = rows.map((row) => row.subCategory.trim());
    const values = rows.map((row) => Number(row.budgetAmount ?? 0));
    const palette = [
      "#5b8def",
      "#5dbb84",
      "#f0b35a",
      "#e67a7a",
      "#8a7be2",
      "#64c2d1",
      "#b9a27a",
      "#7fc17f",
      "#f28fb2",
      "#9aa6b2",
    ];
    const colors = rows.map((_, i) => palette[i % palette.length]);
    return { labels, values, colors };
  }, [editingBudget, draft, budgets]);

  const onDeleteTrip = async () => {
    if (!trip) return;
    setConfirmDeleteTrip(false);
    setDeleting(true);
    setMsg("");
    const { res, data } = await fetchJson<{ error?: string }>(`/api/travel/trips/${tripId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      setDeleting(false);
      setMsg(data.error ?? "Failed to delete trip");
      return;
    }
    router.push("/travel");
  };

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
        <div className="toolbar" style={{ marginTop: 0 }}>
          <Link href="/travel" className="btn ghost sm">
            Back to Travel
          </Link>
          {editingTrip ? (
            <>
              <button
                type="button"
                className="btn ghost sm"
                disabled={savingTrip}
                onClick={() => {
                  if (trip) {
                    setTripDraft({
                      name: trip.name,
                      country: trip.country,
                      startDate: trip.startDate,
                      endDate: trip.endDate,
                    });
                  }
                  setEditingTrip(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn sm"
                disabled={savingTrip}
                onClick={() => void saveTripMeta()}
              >
                {savingTrip ? "Saving…" : "Save"}
              </button>
            </>
          ) : (
            <button type="button" className="btn ghost sm" onClick={() => setEditingTrip(true)}>
              Edit travel
            </button>
          )}
        </div>
      </div>

      {loading ? <p className="note">Loading…</p> : null}
      {editingTrip ? (
        <div className="card">
          <h3>Edit travel</h3>
          <div className="editrow" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
            <input
              type="text"
              placeholder="Trip name"
              value={tripDraft.name}
              onChange={(e) =>
                setTripDraft((prev) => ({
                  ...prev,
                  name: e.target.value,
                }))
              }
            />
            <input
              type="text"
              placeholder="Country"
              value={tripDraft.country}
              onChange={(e) =>
                setTripDraft((prev) => ({
                  ...prev,
                  country: e.target.value,
                }))
              }
            />
            <input
              type="date"
              value={tripDraft.startDate}
              onChange={(e) =>
                setTripDraft((prev) => ({
                  ...prev,
                  startDate: e.target.value,
                }))
              }
            />
            <input
              type="date"
              value={tripDraft.endDate}
              onChange={(e) =>
                setTripDraft((prev) => ({
                  ...prev,
                  endDate: e.target.value,
                }))
              }
            />
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="section-head">
          <h3>Budget breakdown</h3>
          <span className="note">By subcategory</span>
        </div>
        {budgetPie ? (
          <ChartBox
            type="pie"
            height={280}
            data={{
              labels: budgetPie.labels,
              datasets: [
                {
                  data: budgetPie.values,
                  backgroundColor: budgetPie.colors,
                  borderWidth: 2,
                  borderColor: "#faf7ef",
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: true, position: "bottom" },
              },
            }}
          />
        ) : (
          <p className="note">Add budget amounts to see chart.</p>
        )}
      </div>

      <div className="card table-scroll">
        <div className="section-head">
          <h3>Budget</h3>
          {editingBudget ? (
            <div className="toolbar" style={{ marginTop: 0 }}>
              <button
                type="button"
                className="btn ghost sm"
                disabled={savingBudget}
                onClick={() => {
                  setDraft(
                    budgets.map((b) => ({
                      id: b.id,
                      subCategory: b.subCategory,
                      budgetAmount: b.budgetAmount,
                    }))
                  );
                  setEditingBudget(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn sm"
                disabled={savingBudget}
                onClick={() => void saveBudgets()}
              >
                {savingBudget ? "Saving…" : "Save"}
              </button>
            </div>
          ) : (
            <button type="button" className="btn ghost sm" onClick={() => setEditingBudget(true)}>
              Edit
            </button>
          )}
        </div>
        <table>
          <thead>
            <tr>
              <th>Subcategory</th>
              <th className="num">Budget</th>
              <th className="num">Spent</th>
              <th className="num">Remaining</th>
              {editingBudget ? <th style={{ width: 72 }}>Action</th> : null}
            </tr>
          </thead>
          <tbody>
            {(editingBudget ? draft : budgets).length === 0 ? (
              <tr>
                <td colSpan={editingBudget ? 5 : 4} className="note">
                  Add budget categories first.
                </td>
              </tr>
            ) : (
              (editingBudget ? draft : budgets).map((row, i) => {
                const sub = row.subCategory;
                const budgetAmount = row.budgetAmount;
                const spent = spentBySub.get(sub) ?? 0;
                const remaining = budgetAmount - spent;
                const key = row.id ?? `draft-${i}`;
                return (
                  <tr key={key}>
                    <td>
                      {editingBudget ? (
                        <input
                          type="text"
                          value={sub}
                          onChange={(e) =>
                            setDraft((prev) =>
                              prev.map((r, idx) =>
                                idx === i ? { ...r, subCategory: e.target.value } : r
                              )
                            )
                          }
                          placeholder="Subcategory"
                        />
                      ) : (
                        sub
                      )}
                    </td>
                    <td className="num">
                      {editingBudget ? (
                        <DecimalTextInput
                          value={String(budgetAmount)}
                          onChange={(v) =>
                            setDraft((prev) =>
                              prev.map((r, idx) =>
                                idx === i
                                  ? { ...r, budgetAmount: Number(parseFloat(v) || 0) }
                                  : r
                              )
                            )
                          }
                        />
                      ) : (
                        fmt2(budgetAmount)
                      )}
                    </td>
                    <td className="num">{fmt2(spent)}</td>
                    <td className={`num ${remaining < 0 ? "neg" : ""}`}>{fmt2(remaining)}</td>
                    {editingBudget ? (
                      <td>
                        <button
                          type="button"
                          className="btn del sm"
                          onClick={() =>
                            setDraft((prev) => prev.filter((_, idx) => idx !== i))
                          }
                        >
                          del
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr>
              <th>Total</th>
              <th className="num">{fmt2(totals.budget)}</th>
              <th className="num">{fmt2(totals.spent)}</th>
              <th className={`num ${totals.remaining < 0 ? "neg" : ""}`}>
                {fmt2(totals.remaining)}
              </th>
              {editingBudget ? <th /> : null}
            </tr>
          </tfoot>
        </table>
        {editingBudget ? (
          <div className="toolbar" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setDraft((prev) => [...prev, { subCategory: "", budgetAmount: 0 }])}
            >
              + Add category
            </button>
          </div>
        ) : null}
      </div>

      <div className="card">
        <h3>Add expense</h3>
        <form
          className="editrow travel-expense-form"
          onSubmit={(e) => void addExpense(e)}
        >
          <select value={subCategory} onChange={(e) => setSubCategory(e.target.value)}>
            <option value="">Subcategory…</option>
            {budgets.map((b) => (
              <option key={b.id} value={b.subCategory}>
                {b.subCategory}
              </option>
            ))}
          </select>
          <input
            type="datetime-local"
            value={spentAt}
            onChange={(e) => setSpentAt(e.target.value)}
            aria-label="Date and time"
          />
          <DecimalTextInput value={amount} onChange={setAmount} placeholder="Amount" />
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
        <h3>Expense history</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              <th>Subcategory</th>
              <th>Note</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {expenses.length === 0 ? (
              <tr>
                <td colSpan={5} className="note">
                  No expenses yet.
                </td>
              </tr>
            ) : (
              expenses.map((row) => {
                const when = formatTravelSpentAtTable(row.spentAt, row.spentTime);
                return (
                  <tr
                    key={row.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => setSelectedExpense(row)}
                  >
                    <td>{when.date}</td>
                    <td>{when.time || "—"}</td>
                    <td>{row.subCategory}</td>
                    <td>{row.extraNote || "—"}</td>
                    <td className="num">{fmt2(row.amount)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedExpense ? (
        <TravelExpenseActionModal
          tripId={tripId}
          expense={selectedExpense}
          subCategories={budgetSubCategories}
          onClose={() => setSelectedExpense(null)}
          onSaved={(m) => {
            snackbar.show(m);
            void load();
          }}
        />
      ) : null}
      <Snackbar
        message={snackbar.message}
        variant={snackbar.variant}
        durationMs={snackbar.durationMs}
        onDismiss={snackbar.dismiss}
      />

      {msg ? <p className="note">{msg}</p> : null}
      <div className="toolbar" style={{ justifyContent: "flex-end", marginTop: 16 }}>
        {confirmDeleteTrip && trip ? (
          <InlineConfirm
            prompt={`Delete "${trip.name}"? This will remove its budgets.`}
            confirmLabel="Delete travel"
            busy={deleting}
            onConfirm={() => void onDeleteTrip()}
            onCancel={() => setConfirmDeleteTrip(false)}
          />
        ) : (
          <button
            type="button"
            className="btn del sm"
            onClick={() => setConfirmDeleteTrip(true)}
            disabled={deleting || !trip}
          >
            Delete travel
          </button>
        )}
      </div>
    </section>
  );
}
