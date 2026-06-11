"use client";

import type { PokerStatsBundle, StatsSlice } from "@/lib/poker/stats";
import { fmt2 } from "@/lib/finance/helpers";
import {
  formatHourly,
  formatPct,
  formatPl,
  formatPlPlain,
  plClass,
} from "@/components/poker/stats/format";

type Props = { stats: PokerStatsBundle };

const SLICE_LABEL: Record<StatsSlice, string> = {
  cash_game: "Cash game",
  tournament: "Tournament",
  all: "Total",
};

function MetricTable({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; values: Record<StatsSlice, string> }[];
}) {
  const cols: StatsSlice[] = ["cash_game", "tournament", "all"];
  return (
    <div className="card table-scroll poker-stats-table-scroll" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <table>
        <thead>
          <tr>
            <th />
            {cols.map((c) => (
              <th key={c} className="num">
                {SLICE_LABEL[c]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              {cols.map((c) => (
                <td key={c} className="num">
                  {row.values[c]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PokerStatsOverview({ stats }: Props) {
  const { overview } = stats;
  const fin = overview.financial;
  const met = overview.metrics;

  const financialRows = [
    {
      label: "Buy-in",
      values: {
        cash_game: formatPlPlain(fin.cash_game.buyIn),
        tournament: formatPlPlain(fin.tournament.buyIn),
        all: formatPlPlain(fin.all.buyIn),
      },
    },
    {
      label: "Cash-out / won",
      values: {
        cash_game: formatPlPlain(fin.cash_game.cashOut),
        tournament: formatPlPlain(fin.tournament.cashOut),
        all: formatPlPlain(fin.all.cashOut),
      },
    },
    {
      label: "Net profit",
      values: {
        cash_game: formatPl(fin.cash_game.netProfit),
        tournament: formatPl(fin.tournament.netProfit),
        all: formatPl(fin.all.netProfit),
      },
    },
  ];

  const sessionRows = [
    {
      label: "Sessions",
      values: {
        cash_game: String(met.cash_game.sessions),
        tournament: String(met.tournament.sessions),
        all: String(met.all.sessions),
      },
    },
    {
      label: "Hours",
      values: {
        cash_game: met.cash_game.hours ? fmt2(met.cash_game.hours) : "—",
        tournament: met.tournament.hours ? fmt2(met.tournament.hours) : "—",
        all: met.all.hours ? fmt2(met.all.hours) : "—",
      },
    },
    {
      label: "$/h",
      values: {
        cash_game: formatHourly(met.cash_game.hourly),
        tournament: formatHourly(met.tournament.hourly),
        all: formatHourly(met.all.hourly),
      },
    },
    {
      label: "ROI",
      values: {
        cash_game: formatPct(met.cash_game.roi),
        tournament: formatPct(met.tournament.roi),
        all: formatPct(met.all.roi),
      },
    },
    {
      label: "Won",
      values: {
        cash_game: formatPct(met.cash_game.wonPct),
        tournament: formatPct(met.tournament.wonPct),
        all: formatPct(met.all.wonPct),
      },
    },
    {
      label: "Avg buy-in",
      values: {
        cash_game: met.cash_game.avgBuyIn != null ? fmt2(met.cash_game.avgBuyIn) : "—",
        tournament:
          met.tournament.avgBuyIn != null ? fmt2(met.tournament.avgBuyIn) : "—",
        all: met.all.avgBuyIn != null ? fmt2(met.all.avgBuyIn) : "—",
      },
    },
    {
      label: "Avg profit",
      values: {
        cash_game:
          met.cash_game.avgProfit != null ? formatPl(met.cash_game.avgProfit) : "—",
        tournament:
          met.tournament.avgProfit != null ? formatPl(met.tournament.avgProfit) : "—",
        all: met.all.avgProfit != null ? formatPl(met.all.avgProfit) : "—",
      },
    },
  ];

  const { current, previous } = overview.monthCompare;

  return (
    <>
      <div className="poker-stats-summary">
        <div className="poker-stats-summary-stat poker-stats-summary-stat--accent">
          <span className="poker-stats-summary-label">Net profit</span>
          <span className={`poker-stats-summary-value ${plClass(overview.totalNetProfit)}`}>
            {formatPl(overview.totalNetProfit)}
          </span>
        </div>
        <div className="poker-stats-summary-stat">
          <span className="poker-stats-summary-label">Sessions</span>
          <span className="poker-stats-summary-value">{met.all.sessions}</span>
        </div>
        <div className="poker-stats-summary-stat">
          <span className="poker-stats-summary-label">Hourly</span>
          <span className={`poker-stats-summary-value ${plClass(met.all.hourly ?? 0)}`}>
            {formatHourly(met.all.hourly)}
          </span>
        </div>
      </div>

      <p className="poker-stats-fx-note">
        Totals in SGD. Foreign sessions are converted using each session&apos;s stored exchange
        rate (session date, or manual override).
      </p>

      <MetricTable title="Summary" rows={financialRows} />
      <MetricTable title="Sessions" rows={sessionRows} />

      {overview.games.length > 0 ? (
        <div className="card table-scroll poker-stats-table-scroll" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Cash games by stakes</h3>
          <table>
            <thead>
              <tr>
                <th>Game</th>
                <th className="num">Hours</th>
                <th className="num">$/h</th>
                <th className="num">Net profit</th>
              </tr>
            </thead>
            <tbody>
              {overview.games.map((g) => (
                <tr key={g.key}>
                  <td>{g.label}</td>
                  <td className="num">{g.hours ? fmt2(g.hours) : "—"}</td>
                  <td className={`num ${plClass(g.hourly ?? 0)}`}>
                    {formatHourly(g.hourly)}
                  </td>
                  <td className={`num ${plClass(g.netProfit)}`}>{formatPl(g.netProfit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="card table-scroll poker-stats-table-scroll">
        <h3 style={{ marginTop: 0 }}>Current month / last month</h3>
        <table>
          <thead>
            <tr>
              <th />
              <th className="num">This month</th>
              <th className="num">Last month</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Sessions</td>
              <td className="num">{current.sessions}</td>
              <td className="num">{previous.sessions}</td>
            </tr>
            <tr>
              <td>Hours</td>
              <td className="num">{current.hours ? fmt2(current.hours) : "—"}</td>
              <td className="num">{previous.hours ? fmt2(previous.hours) : "—"}</td>
            </tr>
            <tr>
              <td>Net profit</td>
              <td className={`num ${plClass(current.netProfit)}`}>
                {formatPl(current.netProfit)}
              </td>
              <td className={`num ${plClass(previous.netProfit)}`}>
                {formatPl(previous.netProfit)}
              </td>
            </tr>
            <tr>
              <td>Hourly</td>
              <td className={`num ${plClass(current.hourly ?? 0)}`}>
                {formatHourly(current.hourly)}
              </td>
              <td className={`num ${plClass(previous.hourly ?? 0)}`}>
                {formatHourly(previous.hourly)}
              </td>
            </tr>
            <tr>
              <td>ROI</td>
              <td className="num">{formatPct(current.roi)}</td>
              <td className="num">{formatPct(previous.roi)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
