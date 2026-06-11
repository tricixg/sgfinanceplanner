"use client";

import type { LocationBreakdownRow } from "@/lib/poker/stats";
import {
  formatHourly,
  formatHours,
  formatPct,
  formatPl,
  plClass,
} from "@/components/poker/stats/format";

type Props = {
  locations: LocationBreakdownRow[];
  onSelect: (location: string) => void;
};

export function PokerStatsLocations({ locations, onSelect }: Props) {
  if (locations.length === 0) {
    return <p className="note">No locations yet. Add locations when logging sessions.</p>;
  }

  return (
    <div className="poker-location-list">
      {locations.map((loc) => (
        <button
          key={loc.location}
          type="button"
          className="card poker-location-card"
          onClick={() => onSelect(loc.location)}
        >
          <div className="poker-location-card-top">
            <div>
              <div style={{ fontWeight: 600, textAlign: "left" }}>{loc.location}</div>
              <div className="note" style={{ textAlign: "left" }}>
                {loc.cashSessions} cash · {loc.tournamentSessions} tournament
              </div>
            </div>
            <div className={`poker-session-pl ${plClass(loc.netProfit)}`}>
              {formatPl(loc.netProfit)}
            </div>
          </div>
          <div className="poker-location-card-bottom note">
            <span>
              {loc.sessions} {loc.sessions === 1 ? "session" : "sessions"}
            </span>
            <span className="poker-location-meta-hours">
              <svg
                className="poker-location-meta-hours-icon"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden
              >
                <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.25" />
                <path
                  d="M8 4.75V8l2.25 1.5"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {formatHours(loc.hours)}
            </span>
            <span className={plClass(loc.hourly ?? 0)}>{formatHourly(loc.hourly)}</span>
            <span>{formatPct(loc.wonPct)} won</span>
          </div>
        </button>
      ))}
    </div>
  );
}
