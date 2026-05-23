"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import type { Expense } from "@/lib/savings/types";
import { fmt2 } from "@/lib/finance/helpers";

function monthBounds(): { from: string; to: string } {
  const d = new Date();
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const from = `${ym}-01`;
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const to = `${ym}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

export function TabExpenses({ enabled }: { enabled: boolean }) {
  const [items, setItems] = useState<Expense[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [spentAt, setSpentAt] = useState(new Date().toISOString().slice(0, 10));

  const load = useCallback(
    async (append: boolean) => {
      if (!enabled) return;
      setLoading(true);
      const { from, to } = monthBounds();
      const qs = new URLSearchParams({
        from,
        to,
        limit: "50",
        offset: String(append ? offset : 0),
      });
      try {
        const { res, data } = await fetchJson<{
          items?: Expense[];
          nextOffset?: number | null;
          total?: number;
          error?: string;
        }>(`/api/expenses?${qs}`, { credentials: "include" });
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to load expenses");
        }
        setItems((prev) => (append ? [...prev, ...(data.items ?? [])] : data.items ?? []));
        setTotal(data.total ?? 0);
        if (!append) setOffset(data.items?.length ?? 0);
        else if (data.nextOffset != null) setOffset(data.nextOffset);
        console.info("[TabExpenses] loaded", { count: data.items?.length, total: data.total });
      } catch (e) {
        console.error("[TabExpenses] load failed", e);
      } finally {
        setLoading(false);
      }
    },
    [enabled, offset]
  );

  useEffect(() => {
    setOffset(0);
    void load(false);
  }, [enabled]);

  const addExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    try {
      const { res, data } = await fetchJson<{ item?: Expense; error?: string }>(
        "/api/expenses",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: amt,
            category,
            note,
            spentAt,
          }),
        }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to add");
      if (data.item) {
        setItems((prev) => [data.item!, ...prev]);
        setTotal((t) => t + 1);
      }
      setAmount("");
      setCategory("");
      setNote("");
      console.info("[TabExpenses] added", { amount: amt });
    } catch (err) {
      console.error("[TabExpenses] add failed", err);
    }
  };

  const monthTotal = items.reduce((s, x) => s + x.amount, 0);

  if (!enabled) {
    return (
      <section className="panel on">
        <p className="note">Sign in to track expenses in the cloud. Records stay private to you.</p>
      </section>
    );
  }

  return (
    <section className="panel on">
      <div className="callout tip">
        <span className="ico">Tip</span>
        Personal expenses only — your partner cannot see these. Loaded by month (not with the
        main dashboard) so large histories stay fast.
      </div>

      <div className="grid g2">
        <div className="stat">
          <div className="lbl">This month (loaded)</div>
          <div className="val">{fmt2(monthTotal)}</div>
        </div>
        <div className="stat">
          <div className="lbl">Entries shown</div>
          <div className="val">
            {items.length} / {total}
          </div>
        </div>
      </div>

      <h2>Add expense</h2>
      <form className="card" onSubmit={addExpense}>
        <div className="toolbar">
          <label>
            Date
            <input type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} />
          </label>
          <label>
            Amount
            <input
              type="number"
              step={0.01}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </label>
          <label>
            Category
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Food, transport…"
            />
          </label>
        </div>
        <label style={{ display: "block", marginTop: 8 }}>
          Note
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button type="submit" className="btn" style={{ marginTop: 12 }}>
          Add
        </button>
      </form>

      <h2>Recent</h2>
      <div className="card">
        {loading && items.length === 0 ? (
          <p className="loading">Loading…</p>
        ) : items.length === 0 ? (
          <p className="note">No expenses this month yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Note</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.id}>
                  <td>{x.spentAt}</td>
                  <td>{x.category || "—"}</td>
                  <td>{x.note || "—"}</td>
                  <td className="num">{fmt2(x.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {items.length < total ? (
          <button
            type="button"
            className="btn ghost sm"
            style={{ marginTop: 12 }}
            disabled={loading}
            onClick={() => void load(true)}
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
