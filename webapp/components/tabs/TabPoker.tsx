"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import { fmt2 } from "@/lib/finance/helpers";
import { BASE_REPORTING_CURRENCY, POKER_CURRENCIES } from "@/lib/fx/currencies";
import { pokerProfitSgd } from "@/lib/fx/convert";
import {
  formatNativeMoney,
  formatSessionAmountWithSgd,
  formatSessionPlCell,
} from "@/lib/poker/format-session-amount";
import type { PokerGame, PokerSession, PokerSessionType, TournamentResult } from "@/lib/poker/types";
import { formatGameStakes, sessionGameLabel } from "@/lib/poker/types";
import { useFinancialAccounts } from "@/hooks/useFinancialAccounts";
import { DecimalTextInput } from "@/components/DecimalInput";
import {
  formatPokerPlayedAtDisplay,
  pokerPlayedAtToInput,
} from "@/lib/poker/played-at";
import { sgtNowInputDateTime } from "@/lib/time/sgt";
import { PokerSessionMobileCard } from "@/components/poker/PokerSessionMobileCard";

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
  const [submitting, setSubmitting] = useState(false);

  const [sessionType, setSessionType] = useState<PokerSessionType>("cash_game");
  const [buyIn, setBuyIn] = useState("");
  const [cashOut, setCashOut] = useState("");
  const [location, setLocation] = useState("");
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const [playedAt, setPlayedAt] = useState(sgtNowInputDateTime());
  const [financialAccountId, setFinancialAccountId] = useState("");
  const [gameId, setGameId] = useState("");

  const [tournamentName, setTournamentName] = useState("");
  const [eventName, setEventName] = useState("");
  const [tournamentResult, setTournamentResult] = useState<TournamentResult>("placed");
  const [tournamentPlace, setTournamentPlace] = useState("");
  const [tournamentEntries, setTournamentEntries] = useState("");
  const [amountWon, setAmountWon] = useState("");

  const [showNewLocation, setShowNewLocation] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [creatingLocation, setCreatingLocation] = useState(false);
  const [showNewGame, setShowNewGame] = useState(false);
  const [newGameName, setNewGameName] = useState("");
  const [newSmallBlind, setNewSmallBlind] = useState("");
  const [newBigBlind, setNewBigBlind] = useState("");
  const [newAnte, setNewAnte] = useState("");
  const [creatingGame, setCreatingGame] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [currency, setCurrency] = useState(BASE_REPORTING_CURRENCY);
  const [fxRateToSgd, setFxRateToSgd] = useState(1);
  const [fxRateManual, setFxRateManual] = useState(false);
  const [fxRateDate, setFxRateDate] = useState("");
  const [fxSource, setFxSource] = useState("");
  const [fxLoading, setFxLoading] = useState(false);
  const [fxError, setFxError] = useState("");
  const [fxDraft, setFxDraft] = useState("1");
  const skipFxFetch = useRef(false);

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

  const loadFxRate = useCallback(async () => {
    if (!enabled || fxRateManual) return;
    if (currency === BASE_REPORTING_CURRENCY) {
      setFxRateToSgd(1);
      setFxDraft("1");
      setFxRateDate("");
      setFxSource("identity");
      setFxError("");
      return;
    }
    const date = playedAt.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    setFxLoading(true);
    setFxError("");
    try {
      const qs = new URLSearchParams({ from: currency, date });
      const { res, data } = await fetchJson<{
        rate?: number;
        rateDate?: string;
        source?: string;
        error?: string;
      }>(`/api/fx?${qs}`, { credentials: "include" });
      if (!res.ok || data.rate == null) {
        const msg = data.error ?? "Failed to load FX rate";
        console.warn("[TabPoker] fx load failed", { currency, date, msg });
        setFxError(`${msg}. Check "Manual rate" and enter 1 ${currency} = X SGD.`);
        setFxRateManual(true);
        return;
      }
      setFxRateToSgd(data.rate);
      setFxDraft(String(data.rate));
      setFxRateDate(data.rateDate ?? date);
      setFxSource(data.source ?? "");
      setFxError("");
      console.info("[TabPoker] fx loaded", { currency, rate: data.rate, date: data.rateDate });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load FX rate";
      console.warn("[TabPoker] fx load failed", { currency, date, msg });
      setFxError(`${msg}. Check "Manual rate" and enter 1 ${currency} = X SGD.`);
      setFxRateManual(true);
    } finally {
      setFxLoading(false);
    }
  }, [enabled, currency, playedAt, fxRateManual]);

  useEffect(() => {
    if (skipFxFetch.current) {
      skipFxFetch.current = false;
      return;
    }
    void loadFxRate();
  }, [loadFxRate]);

  const resetForm = () => {
    setEditingId(null);
    setFormError("");
    setSessionType("cash_game");
    setBuyIn("");
    setCashOut("");
    setLocation("");
    setHours("");
    setNote("");
    setPlayedAt(sgtNowInputDateTime());
    setFinancialAccountId("");
    setGameId("");
    setTournamentName("");
    setEventName("");
    setTournamentResult("placed");
    setTournamentPlace("");
    setTournamentEntries("");
    setAmountWon("");
    setShowNewLocation(false);
    setNewLocationName("");
    setShowNewGame(false);
    setCurrency(BASE_REPORTING_CURRENCY);
    setFxRateToSgd(1);
    setFxRateManual(false);
    setFxRateDate("");
    setFxSource("");
    setFxDraft("1");
  };

  const ensureLocationOption = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setLocations((prev) =>
      prev.includes(trimmed) ? prev : [...prev, trimmed].sort((a, b) => a.localeCompare(b))
    );
  };

  const createLocation = async () => {
    const name = newLocationName.trim();
    if (!name) return;
    setCreatingLocation(true);
    try {
      const { res, data } = await fetchJson<{ item?: string; error?: string }>(
        "/api/poker/locations",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to save location");
      if (data.item) {
        ensureLocationOption(data.item);
        setLocation(data.item);
        setShowNewLocation(false);
        setNewLocationName("");
        console.info("[TabPoker] location created", { name: data.item });
      }
    } catch (err) {
      console.error("[TabPoker] create location failed", err);
      setFormError(err instanceof Error ? err.message : "Failed to save location");
    } finally {
      setCreatingLocation(false);
    }
  };

  const startEdit = (session: PokerSession) => {
    setEditingId(session.id);
    setFormError("");
    setSessionType(session.sessionType);
    setPlayedAt(pokerPlayedAtToInput(session.playedAt));
    setBuyIn(String(session.buyIn));
    setCashOut(String(session.cashOut));
    ensureLocationOption(session.location);
    setLocation(session.location);
    setHours(session.hours != null ? String(session.hours) : "");
    setNote(session.note);
    setFinancialAccountId(session.financialAccountId ?? "");
    setGameId(session.gameId ?? "");
    setTournamentName(session.tournamentName ?? "");
    setEventName(session.eventName ?? "");
    setTournamentResult(session.tournamentResult ?? "busted");
    setTournamentPlace(
      session.tournamentPlace != null ? String(session.tournamentPlace) : ""
    );
    setTournamentEntries(
      session.tournamentEntries != null ? String(session.tournamentEntries) : ""
    );
    setAmountWon(
      session.amountWon != null && session.tournamentResult === "placed"
        ? String(session.amountWon)
        : ""
    );
    skipFxFetch.current = true;
    setCurrency(session.currency);
    setFxRateToSgd(session.fxRateToSgd);
    setFxRateManual(session.fxRateManual);
    setFxDraft(String(session.fxRateToSgd));
    setFxRateDate("");
    setFxSource(session.fxRateManual ? "manual" : "");
    window.scrollTo({ top: 0, behavior: "smooth" });
    console.info("[TabPoker] editing session", { id: session.id });
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

  const buildSessionBody = (): { body: Record<string, unknown> } | { error: string } => {
    const buy = parseFloat(buyIn);
    if (!Number.isFinite(buy) || buy < 0) {
      return { error: "Enter a valid buy-in." };
    }

    const body: Record<string, unknown> = {
      sessionType,
      buyIn: buy,
      playedAt,
      location: location.trim(),
      hours: hours === "" ? null : parseFloat(hours),
      note,
      currency,
      fxRateManual,
    };
    if (fxRateManual) {
      const rate = parseFloat(fxDraft);
      if (!Number.isFinite(rate) || rate <= 0) {
        return { error: "Enter a valid FX rate (SGD per 1 unit of currency)." };
      }
      body.fxRateToSgd = rate;
    }
    if (financialAccountId) {
      body.financialAccountId = financialAccountId;
    }

    if (sessionType === "cash_game") {
      const out = cashOut === "" ? 0 : parseFloat(cashOut);
      if (!Number.isFinite(out) || out < 0) {
        return { error: "Enter a valid cash-out." };
      }
      if (!gameId) {
        return { error: "Select a game (stakes)." };
      }
      body.cashOut = out;
      body.gameId = gameId;
    } else {
      if (!tournamentName.trim()) {
        return { error: "Tournament name is required." };
      }
      if (!eventName.trim()) {
        return { error: "Event name is required." };
      }
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
        if (!Number.isFinite(won) || won < 0) {
          return { error: "Enter a valid amount won." };
        }
        body.amountWon = won;
        if (tournamentPlace !== "") {
          const place = parseInt(tournamentPlace, 10);
          if (Number.isFinite(place) && place >= 1) body.tournamentPlace = place;
        }
      } else {
        body.amountWon = 0;
      }
    }

    return { body };
  };

  const saveSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const built = buildSessionBody();
    if ("error" in built) {
      setFormError(built.error);
      return;
    }
    const body = built.body;

    setSubmitting(true);
    setFormError("");
    try {
      const isEdit = Boolean(editingId);
      const { res, data } = await fetchJson<{ item?: PokerSession; error?: string }>(
        isEdit ? `/api/poker/${editingId}` : "/api/poker",
        {
          method: isEdit ? "PATCH" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        throw new Error(data.error ?? (isEdit ? "Failed to update session" : "Failed to add session"));
      }
      if (data.item) {
        ensureLocationOption(location);
        if (isEdit) {
          setItems((prev) => prev.map((x) => (x.id === data.item!.id ? data.item! : x)));
          console.info("[TabPoker] updated session", { id: data.item.id });
        } else {
          setItems((prev) => [data.item!, ...prev]);
          setTotal((t) => t + 1);
          console.info("[TabPoker] added session", { id: data.item.id });
        }
      }
      resetForm();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setFormError(msg);
      console.error("[TabPoker] save failed", err);
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
      if (editingId === id) resetForm();
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
        style={{ marginBottom: 16, marginTop: 0, width: "100%", justifyContent: "flex-end" }}
      >
        <Link href="/poker/stats" className="btn ghost sm">
          View statistics
        </Link>
      </div>
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

      <h2>{editingId ? "Edit session" : "Log session"}</h2>
      {editingId ? (
        <p className="note" style={{ marginBottom: 8 }}>
          Updating session — changes will resync the linked cash account entry when P/L changes and an account is selected.
        </p>
      ) : null}
      <form className="card poker-session-form" onSubmit={saveSession}>
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
            Date & time
            <input
              type="datetime-local"
              value={playedAt}
              onChange={(e) => setPlayedAt(e.target.value)}
            />
          </label>
        </div>

        <div className="toolbar" style={{ marginBottom: currency === BASE_REPORTING_CURRENCY ? 12 : 8 }}>
          <label>
            Currency
            <select
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value);
                setFxRateManual(false);
              }}
            >
              {POKER_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {currency !== BASE_REPORTING_CURRENCY ? (
          <div className="poker-fx-panel">
            <div className="poker-fx-field poker-fx-rate-field">
              <span className="poker-fx-field-label">1 {currency} → SGD</span>
              <div className="poker-fx-rate-input">
                <DecimalTextInput
                  value={fxDraft}
                  onChange={(v) => {
                    setFxDraft(v);
                    setFxRateManual(true);
                  }}
                  disabled={!fxRateManual && fxLoading}
                />
              </div>
            </div>
            <div className="poker-fx-field">
              <span className="poker-fx-field-label">Source</span>
              <div className="poker-fx-segment" role="group" aria-label="FX rate source">
                <button
                  type="button"
                  className={!fxRateManual ? "active" : undefined}
                  disabled={fxLoading}
                  onClick={() => {
                    if (!fxRateManual) return;
                    setFxRateManual(false);
                    void loadFxRate();
                  }}
                >
                  Auto
                </button>
                <button
                  type="button"
                  className={fxRateManual ? "active" : undefined}
                  onClick={() => setFxRateManual(true)}
                >
                  Manual
                </button>
              </div>
            </div>
            <p className={`poker-fx-meta${fxError ? " is-error" : ""}`}>
              {fxLoading ? (
                "Loading rate for session date…"
              ) : fxError ? (
                fxError
              ) : fxRateManual ? (
                "Manual rate · totals and ledger use SGD"
              ) : fxRateDate ? (
                <>
                  {fxDraft} SGD · {fxRateDate}
                  {fxSource ? ` · ${fxSource}` : ""}
                  {" · "}
                  <button
                    type="button"
                    className="poker-fx-refresh"
                    disabled={fxLoading}
                    onClick={() => void loadFxRate()}
                  >
                    Refresh
                  </button>
                  {" · weekends/holidays may use prior business day"}
                </>
              ) : (
                "Rate loads from the session date."
              )}
            </p>
          </div>
        ) : null}

        <div
          className="toolbar"
          style={{ marginBottom: 12, flexWrap: "wrap", alignItems: "end" }}
        >
          <label>
            Location
            <select value={location} onChange={(e) => setLocation(e.target.value)}>
              <option value="">Select location…</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => setShowNewLocation((v) => !v)}
          >
            {showNewLocation ? "Cancel new location" : "+ New location"}
          </button>
        </div>

        {showNewLocation ? (
          <div className="card" style={{ marginBottom: 12, background: "var(--surface-2, #f8f9fa)" }}>
            <div className="lbl" style={{ marginBottom: 8 }}>
              New location
            </div>
            <div className="toolbar">
              <label>
                Name
                <input
                  type="text"
                  value={newLocationName}
                  onChange={(e) => setNewLocationName(e.target.value)}
                  placeholder="Marina Bay Sands, Home game…"
                />
              </label>
              <button
                type="button"
                className="btn sm"
                disabled={creatingLocation}
                onClick={() => void createLocation()}
              >
                {creatingLocation ? "Saving…" : "Save location"}
              </button>
            </div>
          </div>
        ) : null}

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
                  Amount won ({currency})
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
            Buy-in ({currency})
            <DecimalTextInput value={buyIn} onChange={setBuyIn} required />
          </label>
          {sessionType === "cash_game" ? (
            <label>
              Cash-out ({currency})
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
            >
              <option value="">Select account (optional — no ledger sync)</option>
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
        {formError ? (
          <p className="note" style={{ marginTop: 8, color: "var(--danger, #c00)" }}>
            {formError}
          </p>
        ) : null}
        <div className="toolbar poker-form-actions" style={{ marginTop: 12 }}>
          <button type="submit" className="btn" disabled={submitting}>
            {submitting ? "Saving…" : editingId ? "Save changes" : "Add session"}
          </button>
          {editingId ? (
            <button type="button" className="btn ghost" disabled={submitting} onClick={resetForm}>
              Cancel
            </button>
          ) : null}
        </div>
      </form>

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
              const outAmount =
                x.sessionType === "tournament"
                  ? x.tournamentResult === "busted"
                    ? null
                    : (x.amountWon ?? 0)
                  : x.cashOut;
              const outLabel =
                outAmount == null ? "—" : formatSessionAmountWithSgd(outAmount, x);
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
                const outAmount =
                  x.sessionType === "tournament"
                    ? x.tournamentResult === "busted"
                      ? null
                      : (x.amountWon ?? 0)
                    : x.cashOut;
                const outLabel =
                  outAmount == null
                    ? "—"
                    : formatSessionAmountWithSgd(outAmount, x);
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
