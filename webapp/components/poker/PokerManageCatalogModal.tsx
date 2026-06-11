"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import type { PokerLocationRecord } from "@/lib/poker/locations";
import { formatGameStakes, type PokerGame } from "@/lib/poker/types";

type Tab = "locations" | "games";

type Props = {
  onClose: () => void;
  onChanged: () => void;
};

export function PokerManageCatalogModal({ onClose, onChanged }: Props) {
  const [tab, setTab] = useState<Tab>("locations");
  const [locations, setLocations] = useState<PokerLocationRecord[]>([]);
  const [games, setGames] = useState<PokerGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [editLocationName, setEditLocationName] = useState("");
  const [newLocationName, setNewLocationName] = useState("");

  const [editingGameId, setEditingGameId] = useState<string | null>(null);
  const [editGameName, setEditGameName] = useState("");
  const [editSmallBlind, setEditSmallBlind] = useState("");
  const [editBigBlind, setEditBigBlind] = useState("");
  const [editAnte, setEditAnte] = useState("");
  const [newGameName, setNewGameName] = useState("");
  const [newSmallBlind, setNewSmallBlind] = useState("");
  const [newBigBlind, setNewBigBlind] = useState("");
  const [newAnte, setNewAnte] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [locRes, gameRes] = await Promise.all([
        fetchJson<{ items?: PokerLocationRecord[] }>("/api/poker/locations", {
          credentials: "include",
        }),
        fetchJson<{ items?: PokerGame[] }>("/api/poker/games", { credentials: "include" }),
      ]);
      if (locRes.data.items) setLocations(locRes.data.items);
      if (gameRes.data.items) setGames(gameRes.data.items);
      console.info("[PokerManageCatalogModal] loaded", {
        locations: locRes.data.items?.length ?? 0,
        games: gameRes.data.items?.length ?? 0,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load";
      setError(msg);
      console.error("[PokerManageCatalogModal] load failed", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const notifyChanged = () => {
    onChanged();
    console.info("[PokerManageCatalogModal] catalog changed");
  };

  const addLocation = async () => {
    const name = newLocationName.trim();
    if (!name) return;
    setBusy(true);
    setError("");
    try {
      const { res, data } = await fetchJson<{ item?: PokerLocationRecord; error?: string }>(
        "/api/poker/locations",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to add location");
      if (data.item) {
        setLocations((prev) =>
          [...prev.filter((l) => l.id !== data.item!.id), data.item!].sort((a, b) =>
            a.name.localeCompare(b.name)
          )
        );
        setNewLocationName("");
        notifyChanged();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add location");
    } finally {
      setBusy(false);
    }
  };

  const saveLocation = async (id: string) => {
    const name = editLocationName.trim();
    if (!name) return;
    setBusy(true);
    setError("");
    try {
      const { res, data } = await fetchJson<{ item?: PokerLocationRecord; error?: string }>(
        `/api/poker/locations/${id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to rename location");
      if (data.item) {
        setLocations((prev) =>
          prev
            .map((l) => (l.id === id ? data.item! : l))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
        setEditingLocationId(null);
        notifyChanged();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to rename location");
    } finally {
      setBusy(false);
    }
  };

  const removeLocation = async (loc: PokerLocationRecord) => {
    const ok = confirm(
      `Delete "${loc.name}"?\n\nPast sessions at this location will keep their data but the location field will be cleared.`
    );
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      const { res, data } = await fetchJson<{ error?: string }>(
        `/api/poker/locations/${loc.id}`,
        { method: "DELETE", credentials: "include" }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to delete location");
      setLocations((prev) => prev.filter((l) => l.id !== loc.id));
      notifyChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete location");
    } finally {
      setBusy(false);
    }
  };

  const parseBlinds = (sb: string, bb: string, ante: string) => {
    const smallBlind = parseFloat(sb);
    const bigBlind = parseFloat(bb);
    if (!Number.isFinite(smallBlind) || smallBlind < 0) {
      throw new Error("Valid small blind required");
    }
    if (!Number.isFinite(bigBlind) || bigBlind < 0) {
      throw new Error("Valid big blind required");
    }
    let anteVal: number | null = null;
    if (ante.trim() !== "") {
      const a = parseFloat(ante);
      if (!Number.isFinite(a) || a < 0) throw new Error("Valid ante required");
      anteVal = a;
    }
    return { smallBlind, bigBlind, ante: anteVal };
  };

  const addGame = async () => {
    const name = newGameName.trim();
    if (!name) return;
    setBusy(true);
    setError("");
    try {
      const blinds = parseBlinds(newSmallBlind, newBigBlind, newAnte);
      const { res, data } = await fetchJson<{ item?: PokerGame; error?: string }>(
        "/api/poker/games",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, ...blinds }),
        }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to add game");
      if (data.item) {
        setGames((prev) =>
          [...prev.filter((g) => g.id !== data.item!.id), data.item!].sort((a, b) =>
            a.name.localeCompare(b.name)
          )
        );
        setNewGameName("");
        setNewSmallBlind("");
        setNewBigBlind("");
        setNewAnte("");
        notifyChanged();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add game");
    } finally {
      setBusy(false);
    }
  };

  const saveGame = async (id: string) => {
    const name = editGameName.trim();
    if (!name) return;
    setBusy(true);
    setError("");
    try {
      const blinds = parseBlinds(editSmallBlind, editBigBlind, editAnte);
      const { res, data } = await fetchJson<{ item?: PokerGame; error?: string }>(
        `/api/poker/games/${id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, ...blinds }),
        }
      );
      if (!res.ok) throw new Error(data.error ?? "Failed to update game");
      if (data.item) {
        setGames((prev) =>
          prev
            .map((g) => (g.id === id ? data.item! : g))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
        setEditingGameId(null);
        notifyChanged();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update game");
    } finally {
      setBusy(false);
    }
  };

  const removeGame = async (game: PokerGame) => {
    const ok = confirm(
      `Delete "${formatGameStakes(game)}"?\n\nOnly unused games can be deleted. Games linked to past sessions must be kept.`
    );
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      const { res, data } = await fetchJson<{ error?: string }>(`/api/poker/games/${game.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(data.error ?? "Failed to delete game");
      setGames((prev) => prev.filter((g) => g.id !== game.id));
      notifyChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete game");
    } finally {
      setBusy(false);
    }
  };

  const startEditLocation = (loc: PokerLocationRecord) => {
    setEditingLocationId(loc.id);
    setEditLocationName(loc.name);
    setEditingGameId(null);
  };

  const startEditGame = (game: PokerGame) => {
    setEditingGameId(game.id);
    setEditGameName(game.name);
    setEditSmallBlind(String(game.smallBlind));
    setEditBigBlind(String(game.bigBlind));
    setEditAnte(game.ante != null ? String(game.ante) : "");
    setEditingLocationId(null);
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="card modal-panel poker-manage-catalog-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="poker-manage-title"
        style={{ maxWidth: 520 }}
      >
        <div className="modal-header">
          <div>
            <h3 id="poker-manage-title" style={{ margin: 0 }}>
              Manage games &amp; locations
            </h3>
            <p className="note" style={{ margin: "4px 0 0" }}>
              Renaming updates all past sessions that use that entry.
            </p>
          </div>
          <button
            type="button"
            className="btn ghost sm"
            disabled={busy}
            onClick={onClose}
            aria-label="Close"
          >
            Close
          </button>
        </div>

        <div className="toolbar" style={{ marginBottom: 12 }}>
          <button
            type="button"
            className={tab === "locations" ? "btn sm" : "btn ghost sm"}
            onClick={() => setTab("locations")}
          >
            Locations
          </button>
          <button
            type="button"
            className={tab === "games" ? "btn sm" : "btn ghost sm"}
            onClick={() => setTab("games")}
          >
            Games
          </button>
        </div>

        {loading ? (
          <p className="loading">Loading…</p>
        ) : tab === "locations" ? (
          <div>
            {locations.length === 0 ? (
              <p className="note">No saved locations yet.</p>
            ) : (
              <ul className="poker-catalog-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {locations.map((loc) => (
                  <li
                    key={loc.id}
                    className="poker-catalog-row"
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      marginBottom: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    {editingLocationId === loc.id ? (
                      <>
                        <input
                          className="inp"
                          value={editLocationName}
                          onChange={(e) => setEditLocationName(e.target.value)}
                          style={{ flex: "1 1 160px" }}
                          disabled={busy}
                        />
                        <button
                          type="button"
                          className="btn sm"
                          disabled={busy || !editLocationName.trim()}
                          onClick={() => void saveLocation(loc.id)}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="btn ghost sm"
                          disabled={busy}
                          onClick={() => setEditingLocationId(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <span style={{ flex: "1 1 160px", fontWeight: 500 }}>{loc.name}</span>
                        <button
                          type="button"
                          className="btn ghost sm"
                          disabled={busy}
                          onClick={() => startEditLocation(loc)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn ghost sm"
                          disabled={busy}
                          onClick={() => void removeLocation(loc)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <div
              className="poker-catalog-add"
              style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border, #ddd)" }}
            >
              <div className="lbl" style={{ marginBottom: 6 }}>
                Add location
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  className="inp"
                  placeholder="Location name"
                  value={newLocationName}
                  onChange={(e) => setNewLocationName(e.target.value)}
                  style={{ flex: "1 1 160px" }}
                  disabled={busy}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void addLocation();
                  }}
                />
                <button
                  type="button"
                  className="btn sm"
                  disabled={busy || !newLocationName.trim()}
                  onClick={() => void addLocation()}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div>
            {games.length === 0 ? (
              <p className="note">No saved games yet.</p>
            ) : (
              <ul className="poker-catalog-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {games.map((game) => (
                  <li
                    key={game.id}
                    className="poker-catalog-row"
                    style={{ marginBottom: 12 }}
                  >
                    {editingGameId === game.id ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <input
                          className="inp"
                          placeholder="Game name"
                          value={editGameName}
                          onChange={(e) => setEditGameName(e.target.value)}
                          disabled={busy}
                        />
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <input
                            className="inp"
                            placeholder="SB"
                            inputMode="decimal"
                            value={editSmallBlind}
                            onChange={(e) => setEditSmallBlind(e.target.value)}
                            style={{ width: 72 }}
                            disabled={busy}
                          />
                          <input
                            className="inp"
                            placeholder="BB"
                            inputMode="decimal"
                            value={editBigBlind}
                            onChange={(e) => setEditBigBlind(e.target.value)}
                            style={{ width: 72 }}
                            disabled={busy}
                          />
                          <input
                            className="inp"
                            placeholder="Ante"
                            inputMode="decimal"
                            value={editAnte}
                            onChange={(e) => setEditAnte(e.target.value)}
                            style={{ width: 72 }}
                            disabled={busy}
                          />
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            type="button"
                            className="btn sm"
                            disabled={busy || !editGameName.trim()}
                            onClick={() => void saveGame(game.id)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="btn ghost sm"
                            disabled={busy}
                            onClick={() => setEditingGameId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <span style={{ flex: "1 1 200px" }}>{formatGameStakes(game)}</span>
                        <button
                          type="button"
                          className="btn ghost sm"
                          disabled={busy}
                          onClick={() => startEditGame(game)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn ghost sm"
                          disabled={busy}
                          onClick={() => void removeGame(game)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <div
              className="poker-catalog-add"
              style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border, #ddd)" }}
            >
              <div className="lbl" style={{ marginBottom: 6 }}>
                Add game
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input
                  className="inp"
                  placeholder="Game name (e.g. NLH)"
                  value={newGameName}
                  onChange={(e) => setNewGameName(e.target.value)}
                  disabled={busy}
                />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input
                    className="inp"
                    placeholder="Small blind"
                    inputMode="decimal"
                    value={newSmallBlind}
                    onChange={(e) => setNewSmallBlind(e.target.value)}
                    style={{ width: 100 }}
                    disabled={busy}
                  />
                  <input
                    className="inp"
                    placeholder="Big blind"
                    inputMode="decimal"
                    value={newBigBlind}
                    onChange={(e) => setNewBigBlind(e.target.value)}
                    style={{ width: 100 }}
                    disabled={busy}
                  />
                  <input
                    className="inp"
                    placeholder="Ante (optional)"
                    inputMode="decimal"
                    value={newAnte}
                    onChange={(e) => setNewAnte(e.target.value)}
                    style={{ width: 100 }}
                    disabled={busy}
                  />
                </div>
                <button
                  type="button"
                  className="btn sm"
                  style={{ alignSelf: "flex-start" }}
                  disabled={busy || !newGameName.trim()}
                  onClick={() => void addGame()}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        )}

        {error ? (
          <p
            className="note"
            style={{ marginBottom: 0, marginTop: 12, color: "var(--bad, #c00)" }}
          >
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
