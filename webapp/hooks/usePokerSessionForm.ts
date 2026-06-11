"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import { BASE_REPORTING_CURRENCY } from "@/lib/fx/currencies";
import { pokerPlayedAtToInput } from "@/lib/poker/played-at";
import type { PokerGame, PokerSession, PokerSessionType, TournamentResult } from "@/lib/poker/types";
import { sgtNowInputDateTime } from "@/lib/time/sgt";

type UsePokerSessionFormOpts = {
  enabled: boolean;
  locations: string[];
  games: PokerGame[];
  setLocations: React.Dispatch<React.SetStateAction<string[]>>;
  setGames: React.Dispatch<React.SetStateAction<PokerGame[]>>;
};

export function usePokerSessionForm({
  enabled,
  locations,
  games,
  setLocations,
  setGames,
}: UsePokerSessionFormOpts) {
  const [editingId, setEditingId] = useState<string | null>(null);
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
  const [rebuyAmount, setRebuyAmount] = useState("");
  const [bountyAmount, setBountyAmount] = useState("");
  const [showNewLocation, setShowNewLocation] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [creatingLocation, setCreatingLocation] = useState(false);
  const [showNewGame, setShowNewGame] = useState(false);
  const [newGameName, setNewGameName] = useState("");
  const [newSmallBlind, setNewSmallBlind] = useState("");
  const [newBigBlind, setNewBigBlind] = useState("");
  const [newAnte, setNewAnte] = useState("");
  const [creatingGame, setCreatingGame] = useState(false);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [currency, setCurrency] = useState(BASE_REPORTING_CURRENCY);
  const [fxRateManual, setFxRateManual] = useState(false);
  const [fxRateDate, setFxRateDate] = useState("");
  const [fxSource, setFxSource] = useState("");
  const [fxLoading, setFxLoading] = useState(false);
  const [fxError, setFxError] = useState("");
  const [fxDraft, setFxDraft] = useState("1");
  const skipFxFetch = useRef(false);

  const ensureLocationOption = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setLocations((prev) =>
        prev.includes(trimmed) ? prev : [...prev, trimmed].sort((a, b) => a.localeCompare(b))
      );
    },
    [setLocations]
  );

  const resetForm = useCallback(() => {
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
    setRebuyAmount("");
    setBountyAmount("");
    setShowNewLocation(false);
    setNewLocationName("");
    setShowNewGame(false);
    setCurrency(BASE_REPORTING_CURRENCY);
    setFxRateManual(false);
    setFxRateDate("");
    setFxSource("");
    setFxDraft("1");
    setFxError("");
  }, []);

  const populateFromSession = useCallback(
    (session: PokerSession) => {
      setEditingId(session.id);
      setFormError("");
      setSessionType(session.sessionType);
      setPlayedAt(pokerPlayedAtToInput(session.playedAt));
      setBuyIn(String(session.buyIn));
      setCashOut(session.sessionType === "cash_game" ? String(session.cashOut) : "");
      ensureLocationOption(session.location);
      setLocation(session.location);
      setHours(session.hours != null ? String(session.hours) : "");
      setNote(session.note);
      setFinancialAccountId(session.financialAccountId ?? "");
      setGameId(session.gameId ?? "");
      if (session.game) {
        setGames((prev) =>
          prev.some((g) => g.id === session.game!.id)
            ? prev
            : [...prev, session.game!].sort((a, b) => a.name.localeCompare(b.name))
        );
      }
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
      setRebuyAmount(session.rebuyAmount > 0 ? String(session.rebuyAmount) : "");
      setBountyAmount(session.bountyAmount > 0 ? String(session.bountyAmount) : "");
      skipFxFetch.current = true;
      setCurrency(session.currency);
      setFxRateManual(session.fxRateManual);
      setFxDraft(String(session.fxRateToSgd));
      setFxRateDate("");
      setFxSource(session.fxRateManual ? "manual" : "");
      console.info("[usePokerSessionForm] populated", { id: session.id });
    },
    [ensureLocationOption, setGames]
  );

  const loadFxRate = useCallback(async () => {
    if (!enabled || fxRateManual) return;
    if (currency === BASE_REPORTING_CURRENCY) {
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
        setFxError(`${msg}. Check "Manual rate" and enter 1 ${currency} = X SGD.`);
        setFxRateManual(true);
        return;
      }
      setFxDraft(String(data.rate));
      setFxRateDate(data.rateDate ?? date);
      setFxSource(data.source ?? "");
      setFxError("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load FX rate";
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

  const createLocation = async () => {
    const name = newLocationName.trim();
    if (!name) return;
    setCreatingLocation(true);
    try {
      const { res, data } = await fetchJson<{
        item?: string | { name: string };
        error?: string;
      }>("/api/poker/locations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(data.error ?? "Failed to save location");
      const savedName =
        typeof data.item === "string" ? data.item : data.item?.name?.trim();
      if (savedName) {
        ensureLocationOption(savedName);
        setLocation(savedName);
        setShowNewLocation(false);
        setNewLocationName("");
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save location");
    } finally {
      setCreatingLocation(false);
    }
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
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create game");
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
      if (rebuyAmount !== "") {
        const rebuy = parseFloat(rebuyAmount);
        if (!Number.isFinite(rebuy) || rebuy < 0) {
          return { error: "Enter a valid rebuy amount." };
        }
        if (rebuy > 0) body.rebuyAmount = rebuy;
      }
      if (bountyAmount !== "") {
        const bounty = parseFloat(bountyAmount);
        if (!Number.isFinite(bounty) || bounty < 0) {
          return { error: "Enter a valid bounty amount." };
        }
        if (bounty > 0) body.bountyAmount = bounty;
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

  const saveSession = async (): Promise<PokerSession | null> => {
    const built = buildSessionBody();
    if ("error" in built) {
      setFormError(built.error);
      return null;
    }

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
          body: JSON.stringify(built.body),
        }
      );
      if (!res.ok) {
        throw new Error(data.error ?? (isEdit ? "Failed to update session" : "Failed to add session"));
      }
      if (data.item) {
        ensureLocationOption(location);
        return data.item;
      }
      return null;
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
      return null;
    } finally {
      setSubmitting(false);
    }
  };

  return {
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
    rebuyAmount,
    setRebuyAmount,
    bountyAmount,
    setBountyAmount,
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
    resetForm,
    populateFromSession,
    createLocation,
    createGame,
    loadFxRate,
    saveSession,
  };
}

export type PokerSessionFormState = ReturnType<typeof usePokerSessionForm>;
