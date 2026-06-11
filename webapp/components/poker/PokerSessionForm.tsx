"use client";

import { DecimalTextInput } from "@/components/DecimalInput";
import type { PokerSessionFormState } from "@/hooks/usePokerSessionForm";
import { BASE_REPORTING_CURRENCY, POKER_CURRENCIES } from "@/lib/fx/currencies";
import type { PokerSessionType, TournamentResult } from "@/lib/poker/types";
import { formatGameStakes } from "@/lib/poker/types";
import type { FinancialAccount } from "@/lib/transactions/types";

type Props = {
  form: PokerSessionFormState;
  cashAccounts: FinancialAccount[];
  onSubmit: (e: React.FormEvent) => void;
  onCancel?: () => void;
  className?: string;
};

export function PokerSessionForm({
  form,
  cashAccounts,
  onSubmit,
  onCancel,
  className = "card poker-session-form",
}: Props) {
  const {
    editingId,
    sessionType,
    setSessionType,
    buyIn,
    setBuyIn,
    cashOut,
    setCashOut,
    location,
    setLocation,
    hours,
    setHours,
    note,
    setNote,
    playedAt,
    setPlayedAt,
    financialAccountId,
    setFinancialAccountId,
    gameId,
    setGameId,
    tournamentName,
    setTournamentName,
    eventName,
    setEventName,
    tournamentResult,
    setTournamentResult,
    tournamentPlace,
    setTournamentPlace,
    tournamentEntries,
    setTournamentEntries,
    amountWon,
    setAmountWon,
    showNewLocation,
    setShowNewLocation,
    newLocationName,
    setNewLocationName,
    creatingLocation,
    showNewGame,
    setShowNewGame,
    newGameName,
    setNewGameName,
    newSmallBlind,
    setNewSmallBlind,
    newBigBlind,
    setNewBigBlind,
    newAnte,
    setNewAnte,
    creatingGame,
    formError,
    submitting,
    currency,
    setCurrency,
    fxRateManual,
    setFxRateManual,
    fxRateDate,
    fxSource,
    fxLoading,
    fxError,
    fxDraft,
    setFxDraft,
    locations,
    games,
    createLocation,
    createGame,
    loadFxRate,
  } = form;

  return (
    <form className={className} onSubmit={onSubmit}>
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
            <DecimalTextInput value={cashOut} onChange={setCashOut} placeholder="0 if bust" />
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
        {editingId && onCancel ? (
          <button type="button" className="btn ghost" disabled={submitting} onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
