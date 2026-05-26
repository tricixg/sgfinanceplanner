"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import { fmt2 } from "@/lib/finance/helpers";
import type { PokerSession } from "@/lib/poker/types";
import { pokerProfit } from "@/lib/poker/types";
import { useFinancialAccounts } from "@/hooks/useFinancialAccounts";
import { DecimalTextInput } from "@/components/DecimalInput";

function monthBounds(): { from: string; to: string } {
  const d = new Date();
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const from = `${ym}-01`;
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const to = `${ym}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

function formatPl(value: number): string {
  const prefix = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${prefix}${fmt2(Math.abs(value))}`;
}

export function TabPoker({ enabled }: { enabled: boolean }) {
  const [items, setItems] = useState<PokerSession[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [buyIn, setBuyIn] = useState("");
  const [cashOut, setCashOut] = useState("");
  const [venue, setVenue] = useState("");
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const [playedAt, setPlayedAt] = useState(new Date().toISOString().slice(0, 10));
  const [financialAccountId, setFinancialAccountId] = useState("");

  const { accounts: financialAccounts } = useFinancialAccounts();
  const cashAccounts = financialAccounts.filter((a) => a.savingsAccountId);

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
          items?: PokerSession[];
          nextOffset?: number | null;
          total?: number;
          error?: string;
        }>(`/api/poker?${qs}`, { credentials: "include" });
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to load poker sessions");
        }
        setItems((prev) => (append ? [...prev, ...(data.items ?? [])] : data.items ?? []));
        setTotal(data.total ?? 0);
        if (!append) setOffset(data.items?.length ?? 0);
        else if (data.nextOffset != null) setOffset(data.nextOffset);
        console.info("[TabPoker] loaded", { count: data.items?.length, total: data.total });
      } catch (e) {
        console.error("[TabPoker] load failed", e);
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

  const addSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const buy = parseFloat(buyIn);
    const out = cashOut === "" ? 0 : parseFloat(cashOut);
    if (!Number.isFinite(buy) || buy < 0) return;
    if (!Number.isFinite(out) || out < 0) return;
    if (!financialAccountId) return;
    const hoursNum = hours === "" ? null : parseFloat(hours);
    try {
      const { res, data } = await fetchJson<{ item?: PokerSession; error?: string }>(
        "/api/poker",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            buyIn: buy,
            cashOut: out,
            venue,
            hours: hoursNum,
            note,
            playedAt,
            financialAccountId,
          }),
        }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to add session");
      if (data.item) {
        setItems((prev) => [data.item!, ...prev]);
        setTotal((t) => t + 1);
      }
      setBuyIn("");
      setCashOut("");
      setVenue("");
      setHours("");
      setNote("");
      console.info("[TabPoker] added session", {
        buyIn: buy,
        cashOut: out,
        profit: out - buy,
      });
    } catch (err) {
      console.error("[TabPoker] add failed", err);
    }
  };

  const removeSession = async (id: string) => {
    if (!confirm("Delete this poker session?")) {
      console.log("[TabPoker] delete cancelled", { id });
      return;
    }
    try {
      const { res, data } = await fetchJson<{ error?: string }>(`/api/poker/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      setItems((prev) => prev.filter((x) => x.id !== id));
      setTotal((t) => Math.max(0, t - 1));
      console.info("[TabPoker] deleted session", { id });
    } catch (err) {
      console.error("[TabPoker] delete failed", err);
    }
  };

  const monthProfit = items.reduce((s, x) => s + pokerProfit(x), 0);
  const monthHours = items.reduce((s, x) => s + (x.hours ?? 0), 0);
  const hourly =
    monthHours > 0 ? monthProfit / monthHours : null;

  if (!enabled) {
    return (
      <section className="panel on">
        <p className="note">Sign in to track poker sessions in the cloud. Records stay private to you.</p>
      </section>
    );
  }

  return (
    <section className="panel on">
      <div className="grid g3">
        <div className="stat accent">
          <div className="lbl">P/L this month (loaded)</div>
          <div className="val">{formatPl(monthProfit)}</div>
        </div>
        <div className="stat">
          <div className="lbl">Sessions</div>
          <div className="val">
            {items.length} / {total}
          </div>
        </div>
        <div className="stat">
          <div className="lbl">Hourly (loaded)</div>
          <div className="val">{hourly != null ? formatPl(hourly) : "—"}</div>
        </div>
      </div>

      <h2>Log session</h2>
      <form className="card" onSubmit={addSession}>
        <div className="toolbar">
          <label>
            Date
            <input type="date" value={playedAt} onChange={(e) => setPlayedAt(e.target.value)} />
          </label>
          <label>
            Buy-in
            <DecimalTextInput value={buyIn} onChange={setBuyIn} required />
          </label>
          <label>
            Cash-out
            <DecimalTextInput
              value={cashOut}
              onChange={setCashOut}
              placeholder="0 if bust"
            />
          </label>
          <label>
            Hours
            <DecimalTextInput
              value={hours}
              onChange={setHours}
              placeholder="Optional"
            />
          </label>
          <label>
            Venue / game
            <input
              type="text"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="Home game, NLHE $2/5…"
            />
          </label>
          <label>
            Cash account
            <select
              value={financialAccountId}
              onChange={(e) => setFinancialAccountId(e.target.value)}
              required
            >
              <option value="">Select account…</option>
              {cashAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label style={{ display: "block", marginTop: 8 }}>
          Note
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button type="submit" className="btn" style={{ marginTop: 12 }}>
          Add session
        </button>
      </form>

      <h2>Recent sessions</h2>
      <div className="card">
        {loading && items.length === 0 ? (
          <p className="loading">Loading…</p>
        ) : items.length === 0 ? (
          <p className="note">No poker sessions this month yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Venue</th>
                <th>Buy-in</th>
                <th>Cash-out</th>
                <th>P/L</th>
                <th>Ledger</th>
                <th>Hrs</th>
                <th>Note</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((x) => {
                const pl = pokerProfit(x);
                return (
                  <tr key={x.id}>
                    <td>{x.playedAt}</td>
                    <td>{x.venue || "—"}</td>
                    <td className="num">{fmt2(x.buyIn)}</td>
                    <td className="num">{fmt2(x.cashOut)}</td>
                    <td className="num">{formatPl(pl)}</td>
                    <td className="note">
                      {pl === 0
                        ? "—"
                        : x.savingsTransactionId
                          ? pl > 0
                            ? `Deposit · ${financialAccounts.find((a) => a.id === x.financialAccountId)?.name ?? "account"}`
                            : `Withdrawal · ${financialAccounts.find((a) => a.id === x.financialAccountId)?.name ?? "account"}`
                          : "No ledger"}
                    </td>
                    <td className="num">{x.hours != null ? x.hours : "—"}</td>
                    <td>{x.note || "—"}</td>
                    <td>
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => void removeSession(x.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
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
