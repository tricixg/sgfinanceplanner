"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import { fmt2 } from "@/lib/finance/helpers";
import type { PokerGame, PokerSession, PokerSessionType, TournamentResult } from "@/lib/poker/types";
import { formatGameStakes, pokerProfit, sessionGameLabel } from "@/lib/poker/types";
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
  const locationListId = useId();
  const [items, setItems] = useState<PokerSession[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [games, setGames] = useState<PokerGame[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [sessionType, setSessionType] = useState<PokerSessionType>("cash_game");
  const [buyIn, setBuyIn] = useState("");
  const [cashOut, setCashOut] = useState("");
  const [location, setLocation] = useState("");
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const [playedAt, setPlayedAt] = useState(new Date().toISOString().slice(0, 10));
  const [financialAccountId, setFinancialAccountId] = useState("");
  const [gameId, setGameId] = useState("");

  const [tournamentName, setTournamentName] = useState("");
  const [eventName, setEventName] = useState("");
  const [tournamentResult, setTournamentResult] = useState<TournamentResult>("placed");
  const [tournamentPlace, setTournamentPlace] = useState("");
  const [tournamentEntries, setTournamentEntries] = useState("");
  const [amountWon, setAmountWon] = useState("");

  const [showNewGame, setShowNewGame] = useState(false);
  const [newGameName, setNewGameName] = useState("");
  const [newSmallBlind, setNewSmallBlind] = useState("");
  const [newBigBlind, setNewBigBlind] = useState("");
  const [newAnte, setNewAnte] = useState("");
  const [creatingGame, setCreatingGame] = useState(false);

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
  }, [enabled]);

  const resetForm = () => {
    setBuyIn("");
    setCashOut("");
    setLocation("");
    setHours("");
    setNote("");
    setGameId("");
    setTournamentName("");
    setEventName("");
    setTournamentResult("placed");
    setTournamentPlace("");
    setTournamentEntries("");
    setAmountWon("");
  };

  const createGame = async () => {
    const sb = parseFloat(newSmallBlind);
    const bb = parseFloat(newBigBlind);
    if (!newGameName.trim()) return;
    if (!Number.isFinite(sb) || sb < 0 || !Number.isFinite(bb) || bb < 0) return;
    setCreatingGame(true);
    try {
      const ante = newAnte === "" ? null : parseFloat(newAnte);
      const { res, data } = await fetchJson<{ item?: PokerGame; error?: string }>(
        "/api/poker/games",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newGameName.trim(),
            smallBlind: sb,
            bigBlind: bb,
            ante: Number.isFinite(ante) && ante! >= 0 ? ante : null,
          }),
        }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to create game");
      if (data.item) {
        setGames((prev) => [...prev, data.item!].sort((a, b) => a.name.localeCompare(b.name)));
        setGameId(data.item.id);
        setShowNewGame(false);
        setNewGameName("");
        setNewSmallBlind("");
        setNewBigBlind("");
        setNewAnte("");
        console.info("[TabPoker] game created", { id: data.item.id });
      }
    } catch (err) {
      console.error("[TabPoker] create game failed", err);
    } finally {
      setCreatingGame(false);
    }
  };

  const addSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const buy = parseFloat(buyIn);
    if (!Number.isFinite(buy) || buy < 0) return;
    if (!financialAccountId) return;

    const body: Record<string, unknown> = {
      sessionType,
      buyIn: buy,
      playedAt,
      location: location.trim(),
      hours: hours === "" ? null : parseFloat(hours),
      note,
      financialAccountId,
    };

    if (sessionType === "cash_game") {
      const out = cashOut === "" ? 0 : parseFloat(cashOut);
      if (!Number.isFinite(out) || out < 0) return;
      if (!gameId) return;
      body.cashOut = out;
      body.gameId = gameId;
    } else {
      body.tournamentName = tournamentName.trim();
      body.eventName = eventName.trim();
      body.tournamentResult = tournamentResult;
      if (tournamentEntries !== "") {
        const entries = parseInt(tournamentEntries, 10);
        if (Number.isFinite(entries) && entries >= 1) {
          body.tournamentEntries = entries;
        }
      }
      if (tournamentResult === "placed") {
        const won = parseFloat(amountWon);
        if (!Number.isFinite(won) || won < 0) return;
        body.amountWon = won;
        if (tournamentPlace !== "") {
          const place = parseInt(tournamentPlace, 10);
          if (Number.isFinite(place) && place >= 1) body.tournamentPlace = place;
        }
      } else {
        body.amountWon = 0;
      }
    }

    setSubmitting(true);
    try {
      const { res, data } = await fetchJson<{ item?: PokerSession; error?: string }>(
        "/api/poker",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to add session");
      if (data.item) {
        setItems((prev) => [data.item!, ...prev]);
        setTotal((t) => t + 1);
        const loc = location.trim();
        if (loc && !locations.includes(loc)) {
          setLocations((prev) => [...prev, loc].sort((a, b) => a.localeCompare(b)));
        }
      }
      resetForm();
      console.info("[TabPoker] added session", { sessionType, buyIn: buy });
    } catch (err) {
      console.error("[TabPoker] add failed", err);
    } finally {
      setSubmitting(false);
    }
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
      console.info("[TabPoker] deleted session", { id });
    } catch (err) {
      console.error("[TabPoker] delete failed", err);
    }
  };

  const monthProfit = items.reduce((s, x) => s + pokerProfit(x), 0);
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
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <label>
            Type
            <select
              value={sessionType}
              onChange={(e) => setSessionType(e.target.value as PokerSessionType)}
            >
              <option value="cash_game">Cash game</option>
              <option value="tournament">Tournament</option>
            </select>
          </label>
          <label>
            Date
            <input type="date" value={playedAt} onChange={(e) => setPlayedAt(e.target.value)} />
          </label>
          <label>
            Location
            <input
              type="text"
              list={locationListId}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Casino, home game…"
            />
            <datalist id={locationListId}>
              {locations.map((loc) => (
                <option key={loc} value={loc} />
              ))}
            </datalist>
          </label>
        </div>

        {sessionType === "cash_game" ? (
          <div className="toolbar" style={{ marginBottom: 12, flexWrap: "wrap", alignItems: "end" }}>
            <label>
              Game (stakes)
              <select value={gameId} onChange={(e) => setGameId(e.target.value)} required>
                <option value="">Select game…</option>
                {games.map((g) => (
                  <option key={g.id} value={g.id}>
                    {formatGameStakes(g)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setShowNewGame((v) => !v)}
            >
              {showNewGame ? "Cancel new game" : "+ New game"}
            </button>
          </div>
        ) : (
          <div className="toolbar" style={{ marginBottom: 12 }}>
            <label>
              Tournament name
              <input
                type="text"
                value={tournamentName}
                onChange={(e) => setTournamentName(e.target.value)}
                placeholder="e.g. APT Taipei"
                required
              />
            </label>
            <label>
              Event name
              <input
                type="text"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="e.g. Main Event Day 1"
                required
              />
            </label>
          </div>
        )}

        {showNewGame && sessionType === "cash_game" ? (
          <div className="card" style={{ marginBottom: 12, background: "var(--surface-2, #f8f9fa)" }}>
            <div className="lbl" style={{ marginBottom: 8 }}>
              New game
            </div>
            <div className="toolbar">
              <label>
                Name
                <input
                  type="text"
                  value={newGameName}
                  onChange={(e) => setNewGameName(e.target.value)}
                  placeholder="NLHE"
                />
              </label>
              <label>
                Small blind
                <DecimalTextInput value={newSmallBlind} onChange={setNewSmallBlind} />
              </label>
              <label>
                Big blind
                <DecimalTextInput value={newBigBlind} onChange={setNewBigBlind} />
              </label>
              <label>
                Ante
                <DecimalTextInput value={newAnte} onChange={setNewAnte} placeholder="Optional" />
              </label>
              <button
                type="button"
                className="btn sm"
                disabled={creatingGame}
                onClick={() => void createGame()}
              >
                {creatingGame ? "Saving…" : "Save game"}
              </button>
            </div>
          </div>
        ) : null}

        {sessionType === "tournament" ? (
          <div className="toolbar" style={{ marginBottom: 12 }}>
            <label>
              Result
              <select
                value={tournamentResult}
                onChange={(e) => setTournamentResult(e.target.value as TournamentResult)}
              >
                <option value="placed">Placed (in the money)</option>
                <option value="busted">Busted</option>
              </select>
            </label>
            {tournamentResult === "placed" ? (
              <>
                <label>
                  Place
                  <input
                    type="number"
                    min={1}
                    value={tournamentPlace}
                    onChange={(e) => setTournamentPlace(e.target.value)}
                    placeholder="e.g. 12"
                  />
                </label>
                <label>
                  Amount won
                  <DecimalTextInput value={amountWon} onChange={setAmountWon} required />
                </label>
              </>
            ) : null}
            <label>
              Total entries
              <input
                type="number"
                min={1}
                value={tournamentEntries}
                onChange={(e) => setTournamentEntries(e.target.value)}
                placeholder="Field size"
              />
            </label>
          </div>
        ) : null}

        <div className="toolbar">
          <label>
            Buy-in
            <DecimalTextInput value={buyIn} onChange={setBuyIn} required />
          </label>
          {sessionType === "cash_game" ? (
            <label>
              Cash-out
              <DecimalTextInput
                value={cashOut}
                onChange={setCashOut}
                placeholder="0 if bust"
              />
            </label>
          ) : null}
          <label>
            Hours
            <DecimalTextInput value={hours} onChange={setHours} placeholder="Optional" />
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
        <button type="submit" className="btn" style={{ marginTop: 12 }} disabled={submitting}>
          {submitting ? "Saving…" : "Add session"}
        </button>
      </form>

      <h2>Recent sessions</h2>
      <div className="card table-scroll">
        {loading && items.length === 0 ? (
          <p className="loading">Loading…</p>
        ) : items.length === 0 ? (
          <p className="note">No poker sessions this month yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Location</th>
                <th>Game / event</th>
                <th>Buy-in</th>
                <th>Out / won</th>
                <th>P/L</th>
                <th>Result</th>
                <th>Hrs</th>
                <th>Note</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((x) => {
                const pl = pokerProfit(x);
                const outLabel =
                  x.sessionType === "tournament"
                    ? x.tournamentResult === "busted"
                      ? "—"
                      : fmt2(x.amountWon ?? 0)
                    : fmt2(x.cashOut);
                return (
                  <tr key={x.id}>
                    <td>{x.playedAt}</td>
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
                    <td className="num">{fmt2(x.buyIn)}</td>
                    <td className="num">{outLabel}</td>
                    <td className="num">{formatPl(pl)}</td>
                    <td>{tournamentResultLabel(x)}</td>
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
