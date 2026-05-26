"use client";

import type { PokerSession } from "@/lib/poker/types";
import { pokerProfit, sessionGameLabel } from "@/lib/poker/types";
import { fmt2 } from "@/lib/finance/helpers";
import {
  formatPl,
  formatSessionDate,
  plClass,
} from "@/components/poker/stats/format";

type Props = { sessions: PokerSession[] };

export function PokerStatsSessions({ sessions }: Props) {
  if (sessions.length === 0) {
    return <p className="note">No sessions logged yet.</p>;
  }

  const byYear = new Map<string, PokerSession[]>();
  for (const s of sessions) {
    const y = s.playedAt.slice(0, 4);
    const list = byYear.get(y) ?? [];
    list.push(s);
    byYear.set(y, list);
  }

  const years = [...byYear.keys()].sort((a, b) => b.localeCompare(a));

  return (
    <div className="poker-session-list">
      {years.map((year) => (
        <div key={year} style={{ marginBottom: 20 }}>
          <div className="lbl" style={{ marginBottom: 8 }}>
            {year}
          </div>
          {byYear.get(year)!.map((s) => {
            const pl = pokerProfit(s);
            const gameLabel =
              s.sessionType === "tournament"
                ? s.tournamentName
                  ? `${s.tournamentName} · ${sessionGameLabel(s)}`
                  : sessionGameLabel(s)
                : sessionGameLabel(s);
            return (
              <div key={s.id} className="card poker-session-card">
                <div className="poker-session-card-top">
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {s.sessionType === "tournament" ? "Tournament" : "Cash"} · {gameLabel}
                    </div>
                    <div className="note">{s.location || "—"}</div>
                  </div>
                  <div className={`poker-session-pl ${plClass(pl)}`}>{formatPl(pl)}</div>
                </div>
                <div className="poker-session-card-bottom note">
                  <span>Buy-in {fmt2(s.buyIn)}</span>
                  <span>{formatSessionDate(s.playedAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
