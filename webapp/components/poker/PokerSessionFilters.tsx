"use client";

import type { PokerGame } from "@/lib/poker/types";
import { formatGameStakes } from "@/lib/poker/types";
import {
  EMPTY_POKER_SESSION_FILTERS,
  pokerSessionFiltersActive,
  type PokerSessionListFilters,
  type PokerSessionTypeFilter,
} from "@/lib/poker/filter-sessions";

type Props = {
  filters: PokerSessionListFilters;
  locations: string[];
  games: PokerGame[];
  matchedCount: number;
  totalCount: number;
  onChange: (next: PokerSessionListFilters) => void;
};

const TYPE_OPTIONS: { value: PokerSessionTypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "cash_game", label: "Cash" },
  { value: "tournament", label: "MTT" },
];

export function PokerSessionFilters({
  filters,
  locations,
  games,
  matchedCount,
  totalCount,
  onChange,
}: Props) {
  const stakesDisabled = filters.sessionType === "tournament";
  const filtersActive = pokerSessionFiltersActive(filters);

  const setType = (sessionType: PokerSessionTypeFilter) => {
    const next: PokerSessionListFilters = {
      ...filters,
      sessionType,
      gameId: sessionType === "tournament" ? "" : filters.gameId,
    };
    console.info("[PokerSessionFilters] session type", { sessionType });
    onChange(next);
  };

  const clearFilters = () => {
    console.info("[PokerSessionFilters] cleared");
    onChange(EMPTY_POKER_SESSION_FILTERS);
  };

  return (
    <div className="poker-session-filters">
      <div className="poker-session-filters-row">
        <div className="poker-session-filter poker-session-filter--type">
          <span className="tx-filter-label">Type</span>
          <div className="poker-fx-segment" role="group" aria-label="Session type">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={filters.sessionType === opt.value ? "active" : undefined}
                aria-pressed={filters.sessionType === opt.value}
                onClick={() => setType(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <label className="tx-filter poker-session-filter-stakes">
          <span className="tx-filter-label">Stakes</span>
          {stakesDisabled ? (
            <span className="poker-session-filter-muted" aria-hidden="true">
              —
            </span>
          ) : (
            <select
              value={filters.gameId}
              aria-label="Filter by stakes"
              onChange={(e) => {
                const gameId = e.target.value;
                console.info("[PokerSessionFilters] stakes", { gameId: gameId || null });
                onChange({ ...filters, gameId });
              }}
            >
              <option value="">Any</option>
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  {formatGameStakes(g)}
                </option>
              ))}
            </select>
          )}
        </label>

        <label className="tx-filter">
          <span className="tx-filter-label">Location</span>
          <select
            value={filters.location}
            aria-label="Filter by location"
            onChange={(e) => {
              const location = e.target.value;
              console.info("[PokerSessionFilters] location", { location: location || null });
              onChange({ ...filters, location });
            }}
          >
            <option value="">Any</option>
            {locations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </label>

        {filtersActive ? (
          <div className="tx-filters-actions">
            <button type="button" className="btn ghost sm" onClick={clearFilters}>
              Clear
            </button>
          </div>
        ) : null}
      </div>

      {filtersActive ? (
        <p className="poker-session-filters-meta">
          Showing {matchedCount} of {totalCount} session{totalCount === 1 ? "" : "s"}
        </p>
      ) : null}
    </div>
  );
}
