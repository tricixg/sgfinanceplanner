"use client";

import type { LocationBreakdownRow } from "@/lib/poker/stats";
import { fmt2 } from "@/lib/finance/helpers";
import {
  formatHourly,
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
            <span>{loc.hours ? `${fmt2(loc.hours)}h` : "—"}</span>
            <span className={plClass(loc.hourly ?? 0)}>{formatHourly(loc.hourly)}</span>
            <span>{formatPct(loc.wonPct)} won</span>
          </div>
        </button>
      ))}
    </div>
  );
}
