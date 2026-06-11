"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import { fmt2 } from "@/lib/finance/helpers";
import { pokerProfitSgd } from "@/lib/fx/convert";
import {
  formatSessionAmountWithSgd,
  formatSessionPlCell,
  formatSessionReturnCell,
} from "@/lib/poker/format-session-amount";
import type { PokerGame, PokerSession } from "@/lib/poker/types";
import { sessionGameLabel } from "@/lib/poker/types";
import { useFinancialAccounts } from "@/hooks/useFinancialAccounts";
import { usePokerSessionForm } from "@/hooks/usePokerSessionForm";
import { formatPokerPlayedAtDisplay } from "@/lib/poker/played-at";
import { PokerManageCatalogModal } from "@/components/poker/PokerManageCatalogModal";
import { PokerSessionForm } from "@/components/poker/PokerSessionForm";
import { PokerSessionMobileCard } from "@/components/poker/PokerSessionMobileCard";
import { dispatchDomainEvent } from "@/lib/events/domain-events";

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

function tournamentResultLabel(session: PokerSession): string {
  if (session.sessionType !== "tournament") return "—";
  if (session.tournamentResult === "busted") return "Busted";
  if (session.tournamentResult === "placed") {
    const place =
      session.tournamentPlace != null ? `#${session.tournamentPlace}` : "Placed";
    const entries =
      session.tournamentEntries != null ? ` / ${session.tournamentEntries}` : "";
    return `${place}${entries}`;
  }
  return "—";
}

export function TabPoker({ enabled }: { enabled: boolean }) {
  const [items, setItems] = useState<PokerSession[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [games, setGames] = useState<PokerGame[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  const { accounts: financialAccounts } = useFinancialAccounts();
  const cashAccounts = financialAccounts.filter((a) => a.savingsAccountId);

  const form = usePokerSessionForm({
    enabled,
    locations,
    games,
    setLocations,
    setGames,
  });

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
          locations?: string[];
          games?: PokerGame[];
          error?: string;
        }>(`/api/poker?${qs}`, { credentials: "include" });
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to load poker sessions");
        }
        setItems((prev) => (append ? [...prev, ...(data.items ?? [])] : data.items ?? []));
        setTotal(data.total ?? 0);
        if (!append) {
          setOffset(data.items?.length ?? 0);
          if (data.locations) setLocations(data.locations);
          if (data.games) setGames(data.games);
        } else if (data.nextOffset != null) {
          setOffset(data.nextOffset);
        }
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
    // Reload when sign-in becomes available; offset reset is intentional on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- enabled gate only
  }, [enabled]);

  const startEdit = (session: PokerSession) => {
    form.populateFromSession(session);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const isEdit = Boolean(form.editingId);
    const saved = await form.saveSession();
    if (!saved) return;

    if (isEdit) {
      setItems((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
      console.info("[TabPoker] updated session", { id: saved.id });
    } else {
      setItems((prev) => [saved, ...prev]);
      setTotal((t) => t + 1);
      console.info("[TabPoker] added session", { id: saved.id });
    }
    if (saved.financialAccountId && saved.savingsTransactionId) {
      dispatchDomainEvent("savings:changed");
    }
    form.resetForm();
  };

  const removeSession = async (id: string) => {
    if (!confirm("Delete this poker session?")) return;
    try {
      const { res, data } = await fetchJson<{ error?: string }>(`/api/poker/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      setItems((prev) => prev.filter((x) => x.id !== id));
      setTotal((t) => Math.max(0, t - 1));
      if (form.editingId === id) form.resetForm();
      dispatchDomainEvent("savings:changed");
      console.info("[TabPoker] deleted session", { id });
    } catch (err) {
      console.error("[TabPoker] delete failed", err);
    }
  };

  const monthProfit = items.reduce((s, x) => s + pokerProfitSgd(x), 0);
  const monthHours = items.reduce((s, x) => s + (x.hours ?? 0), 0);
  const hourly = monthHours > 0 ? monthProfit / monthHours : null;

  if (!enabled) {
    return (
      <section className="panel on">
        <p className="note">Sign in to track poker sessions in the cloud. Records stay private to you.</p>
      </section>
    );
  }

  return (
    <section className="panel on">
      <div
        className="toolbar"
        style={{ marginBottom: 16, marginTop: 0, width: "100%", justifyContent: "flex-end", gap: 12 }}
      >
        <button type="button" className="btn ghost sm" onClick={() => setManageOpen(true)}>
          Manage games &amp; locations
        </button>
        <Link href="/poker/stats" className="btn ghost sm">
          View statistics
        </Link>
      </div>

      {manageOpen ? (
        <PokerManageCatalogModal
          onClose={() => setManageOpen(false)}
          onChanged={() => {
            void load(false);
            console.info("[TabPoker] catalog changed, reloaded");
          }}
        />
      ) : null}
      <div className="grid g3">
        <div className="stat accent">
          <div className="lbl">P/L this month (SGD, loaded)</div>
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

      <h2>{form.editingId ? "Edit session" : "Log session"}</h2>
      {form.editingId ? (
        <p className="note" style={{ marginBottom: 8 }}>
          Updating session — changes will resync the linked cash account entry when P/L changes and an account is selected.
        </p>
      ) : null}
      <PokerSessionForm
        form={form}
        cashAccounts={cashAccounts}
        onSubmit={(e) => void saveSession(e)}
        onCancel={form.resetForm}
      />

      <h2>Recent sessions</h2>
      {loading && items.length === 0 ? (
        <div className="card">
          <p className="loading">Loading…</p>
        </div>
      ) : items.length === 0 ? (
        <div className="card">
          <p className="note">No poker sessions this month yet.</p>
        </div>
      ) : (
        <>
          <div className="poker-recent-cards poker-only-mobile">
            {items.map((x) => {
              const outLabel = formatSessionReturnCell(x);
              return (
                <PokerSessionMobileCard
                  key={x.id}
                  session={x}
                  outLabel={outLabel}
                  resultLabel={tournamentResultLabel(x)}
                  onEdit={() => startEdit(x)}
                  onDelete={() => void removeSession(x.id)}
                />
              );
            })}
          </div>
          <div className="card table-scroll poker-recent-table poker-only-desktop">
            <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Location</th>
                <th>Game / event</th>
                <th>Buy-in</th>
                <th>Cash-out / won</th>
                <th>P/L</th>
                <th>Result</th>
                <th>Hrs</th>
                <th>Note</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((x) => {
                const outLabel = formatSessionReturnCell(x);
                return (
                  <tr key={x.id}>
                    <td>{formatPokerPlayedAtDisplay(x.playedAt)}</td>
                    <td>{x.sessionType === "tournament" ? "MTT" : "Cash"}</td>
                    <td>{x.location || "—"}</td>
                    <td>
                      {x.sessionType === "tournament" && x.tournamentName ? (
                        <span>
                          {x.tournamentName}
                          <div className="note">{sessionGameLabel(x)}</div>
                        </span>
                      ) : (
                        sessionGameLabel(x)
                      )}
                    </td>
                    <td className="num">{formatSessionAmountWithSgd(x.buyIn, x)}</td>
                    <td className="num">{outLabel}</td>
                    <td className="num">{formatSessionPlCell(x)}</td>
                    <td>{tournamentResultLabel(x)}</td>
                    <td className="num">{x.hours != null ? x.hours : "—"}</td>
                    <td>{x.note || "—"}</td>
                    <td className="recurring-actions">
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => startEdit(x)}
                      >
                        Edit
                      </button>
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
          </div>
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
        </>
      )}
    </section>
  );
}
