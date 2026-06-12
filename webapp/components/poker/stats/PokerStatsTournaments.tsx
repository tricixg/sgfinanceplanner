"use client";

import { useMemo } from "react";
import type { PokerStatsBundle } from "@/lib/poker/stats";
import { buildTournamentStats } from "@/lib/poker/tournament-stats";
import { fmt2 } from "@/lib/finance/helpers";
import {
  formatHourly,
  formatHours,
  formatPct,
  formatPl,
  formatPlPlain,
  plClass,
} from "@/components/poker/stats/format";

type Props = { stats: PokerStatsBundle };

export function PokerStatsTournaments({ stats }: Props) {
  const tournamentStats = useMemo(
    () => buildTournamentStats(stats.sessions),
    [stats.sessions]
  );
  const { summary, bySeries } = tournamentStats;

  if (summary.sessions === 0) {
    return <p className="note">No tournament sessions logged yet.</p>;
  }

  return (
    <>
      <div className="poker-stats-summary poker-stats-summary--4">
        <div className="poker-stats-summary-stat poker-stats-summary-stat--accent">
          <span className="poker-stats-summary-label">Net profit</span>
          <span className={`poker-stats-summary-value ${plClass(summary.netProfit)}`}>
            {formatPl(summary.netProfit)}
          </span>
        </div>
        <div className="poker-stats-summary-stat">
          <span className="poker-stats-summary-label">ITM</span>
          <span className="poker-stats-summary-value">{formatPct(summary.itmPct)}</span>
        </div>
        <div className="poker-stats-summary-stat">
          <span className="poker-stats-summary-label">Sessions</span>
          <span className="poker-stats-summary-value">{summary.sessions}</span>
        </div>
        <div className="poker-stats-summary-stat">
          <span className="poker-stats-summary-label">ROI</span>
          <span className={`poker-stats-summary-value ${plClass(summary.roi ?? 0)}`}>
            {formatPct(summary.roi)}
          </span>
        </div>
      </div>

      <p className="poker-stats-fx-note">
        Totals in SGD (buy-in includes rebuys; return is prize + bounties).
      </p>

      <div className="card table-scroll poker-stats-table-scroll" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Results</h3>
        <table>
          <tbody>
            <tr>
              <td>Placed (ITM)</td>
              <td className="num">{summary.placed}</td>
            </tr>
            <tr>
              <td>Busted</td>
              <td className="num">{summary.busted}</td>
            </tr>
            <tr>
              <td>ITM rate</td>
              <td className="num">{formatPct(summary.itmPct)}</td>
            </tr>
            <tr>
              <td>Avg finish (placed)</td>
              <td className="num">
                {summary.avgPlace != null ? fmt2(summary.avgPlace) : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card table-scroll poker-stats-table-scroll" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Financials</h3>
        <table>
          <tbody>
            <tr>
              <td>Total buy-in</td>
              <td className="num">{formatPlPlain(summary.buyIn)}</td>
            </tr>
            <tr>
              <td>Rebuys</td>
              <td className="num">{formatPlPlain(summary.rebuyTotal)}</td>
            </tr>
            <tr>
              <td>Prize won</td>
              <td className="num">{formatPlPlain(summary.amountWonTotal)}</td>
            </tr>
            <tr>
              <td>Bounties</td>
              <td className="num">{formatPlPlain(summary.bountyTotal)}</td>
            </tr>
            <tr>
              <td>Total return</td>
              <td className="num">{formatPlPlain(summary.returnTotal)}</td>
            </tr>
            <tr>
              <td>Net profit</td>
              <td className={`num ${plClass(summary.netProfit)}`}>
                {formatPl(summary.netProfit)}
              </td>
            </tr>
            <tr>
              <td>ROI</td>
              <td className={`num ${plClass(summary.roi ?? 0)}`}>{formatPct(summary.roi)}</td>
            </tr>
            <tr>
              <td>Avg buy-in</td>
              <td className="num">
                {summary.avgBuyIn != null ? fmt2(summary.avgBuyIn) : "—"}
              </td>
            </tr>
            <tr>
              <td>Avg profit</td>
              <td className={`num ${plClass(summary.avgProfit ?? 0)}`}>
                {summary.avgProfit != null ? formatPl(summary.avgProfit) : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card table-scroll poker-stats-table-scroll" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Volume</h3>
        <table>
          <tbody>
            <tr>
              <td>Sessions</td>
              <td className="num">{summary.sessions}</td>
            </tr>
            <tr>
              <td>Hours</td>
              <td className="num">{formatHours(summary.hours)}</td>
            </tr>
            <tr>
              <td>$/h</td>
              <td className={`num ${plClass(summary.hourly ?? 0)}`}>
                {formatHourly(summary.hourly)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {bySeries.length > 0 ? (
        <div className="card table-scroll poker-stats-table-scroll">
          <h3 style={{ marginTop: 0 }}>By tournament series</h3>
          <table>
            <thead>
              <tr>
                <th>Series</th>
                <th className="num">Sessions</th>
                <th className="num">Placed</th>
                <th className="num">Busted</th>
                <th className="num">ITM</th>
                <th className="num">Buy-in</th>
                <th className="num">Net profit</th>
              </tr>
            </thead>
            <tbody>
              {bySeries.map((row) => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  <td className="num">{row.sessions}</td>
                  <td className="num">{row.placed}</td>
                  <td className="num">{row.busted}</td>
                  <td className="num">{formatPct(row.itmPct)}</td>
                  <td className="num">{formatPlPlain(row.buyIn)}</td>
                  <td className={`num ${plClass(row.netProfit)}`}>{formatPl(row.netProfit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
