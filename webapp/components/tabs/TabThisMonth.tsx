"use client";

import { useMemo, useState } from "react";
import type { DashboardState } from "@/lib/types";
import {
  addMonthsYm,
  attachEventsToGrid,
  buildMonthGrid,
  getCalendarEvents,
  totalStatementAmount,
} from "@/lib/finance/calendar";
import { netWorthSlices, netWorthTotal, wealthSummary } from "@/lib/finance";
import type { SavingsBundle, SavingsSnapshot } from "@/lib/savings/types";
import { currentYm, fmt, fmt2, formatMonthLabel } from "@/lib/finance/helpers";
import { ChartBox } from "@/components/ChartBox";

type Props = {
  state: DashboardState;
  setState: (s: DashboardState | ((p: DashboardState) => DashboardState)) => void;
  savings?: SavingsSnapshot | null;
  savingsBundle?: SavingsBundle | null;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function TabThisMonth({ state: S, setState, savings }: Props) {
  const [viewYm, setViewYm] = useState(currentYm);
  const [includeCpf, setIncludeCpf] = useState(false);
  const todayYm = currentYm();
  const todayDay = new Date().getDate();
  const personalOnlySavings = savings
    ? {
        ...savings,
        jointCash: 0,
        jointNetWorthCash: 0,
        jointSavingsCash: 0,
        jointMonthlySave: 0,
      }
    : null;
  const { liab, lnw, personalCash } = wealthSummary(S, personalOnlySavings);
  const personalSavings =
    savings?.personalSavingsCash ?? savings?.personalCash ?? personalCash;
  const totalNw = netWorthTotal(S, includeCpf, personalOnlySavings);
  const nwSlices = netWorthSlices(S, includeCpf, personalOnlySavings);

  const events = useMemo(
    () => getCalendarEvents(S, viewYm),
    [S, viewYm]
  );
  const grid = useMemo(
    () => attachEventsToGrid(buildMonthGrid(viewYm), events),
    [viewYm, events]
  );
  const stmtTotal = totalStatementAmount(S);

  return (
    <section className="panel on">
      <h2>Net worth</h2>
      <div className="card net-worth-card" style={{ marginBottom: 16 }}>
        <p className="note" style={{ marginTop: 8 }}>
          Personal savings (your accounts): {fmt2(personalSavings)}
        </p>
        <label className="ctrl">
          <input
            type="checkbox"
            checked={includeCpf}
            onChange={(e) => {
              setIncludeCpf(e.target.checked);
              console.log("[TabThisMonth] include CPF", e.target.checked);
            }}
          />
          Include CPF in total net worth
        </label>
        <div className="net-worth-total">
          <div className="lbl">Total net worth</div>
          <div className="val">{fmt(totalNw)}</div>
          <div className="note">
            {includeCpf ? "Includes CPF" : "Excludes CPF"} · liquid {fmt(lnw)} · debt deducted (
            {fmt(liab)})
          </div>
        </div>
        {nwSlices.length > 0 ? (
          <ChartBox
            type="pie"
            height={280}
            data={{
              labels: nwSlices.map((s) => s.label),
              datasets: [
                {
                  data: nwSlices.map((s) => s.value),
                  backgroundColor: nwSlices.map((s) => s.color),
                  borderWidth: 2,
                  borderColor: "#faf7ef",
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: true,
                  position: "bottom",
                  labels: { boxWidth: 12, padding: 14 },
                },
                tooltip: {
                  callbacks: {
                    label: (ctx) => {
                      const v = Number(ctx.raw);
                      const sum = nwSlices.reduce((s, x) => s + x.value, 0);
                      const pct = sum > 0 ? ((v / sum) * 100).toFixed(1) : "0";
                      return ` ${fmt(v)} (${pct}%)`;
                    },
                  },
                },
              },
            }}
          />
        ) : (
          <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
            Add holdings on Investment, savings accounts on ME, or CPF on CPF Outlook.
          </p>
        )}
      </div>

      <div className="grid g3" style={{ marginBottom: 16 }}>
        <div className="stat accent">
          <div className="lbl">Statement balances (all cards)</div>
          <div className="val">{fmt(stmtTotal)}</div>
          <div className="note">Edit on Credit Cards tab (Edit button)</div>
        </div>
        <div className="stat">
          <div className="lbl">Events this month</div>
          <div className="val">{events.length}</div>
        </div>
        <div className="stat">
          <div className="lbl">Salary credit day</div>
          <div className="val">Day {S.salaryCreditDay}</div>
        </div>
      </div>

      <div className="card">
        <div className="cal-nav cal-nav--in-card">
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => setViewYm((v) => addMonthsYm(v, -1))}
          >
            Prev
          </button>
          <h2>{formatMonthLabel(viewYm)}</h2>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => setViewYm((v) => addMonthsYm(v, 1))}
          >
            Next
          </button>
          {viewYm !== todayYm && (
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setViewYm(todayYm)}
            >
              Today
            </button>
          )}
        </div>
        <div className="cal-weekdays">
          {WEEKDAYS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="cal-grid">
          {grid.map((cell, i) => {
            const dayNum = cell.date.getDate();
            const isToday =
              cell.inMonth &&
              viewYm === todayYm &&
              dayNum === todayDay;
            return (
              <div
                key={i}
                className={`cal-day ${cell.inMonth ? "" : "out"} ${isToday ? "today" : ""}`}
              >
                <div className="cal-day-num">{dayNum}</div>
                {cell.events.map((ev, j) => (
                  <span
                    key={j}
                    className={`cal-event ${ev.type}`}
                    title={ev.detail ?? ev.label}
                  >
                    {ev.label}
                    {ev.amount != null && ev.amount > 0
                      ? ` ${fmt2(ev.amount)}`
                      : ""}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
        <div className="cal-legend">
          <span><i style={{ background: "rgba(47,93,58,.3)" }} />Salary</span>
          <span><i style={{ background: "rgba(192,138,46,.3)" }} />Statement</span>
          <span><i style={{ background: "rgba(181,72,46,.2)" }} />Payment due</span>
          <span><i style={{ background: "rgba(61,107,142,.2)" }} />Loan ends</span>
        </div>
      </div>

      <h2>Upcoming in {formatMonthLabel(viewYm)}</h2>
      <div className="card">
        {events.length === 0 ? (
          <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
            No events configured for this month.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th>Event</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev, i) => (
                <tr key={i}>
                  <td className="num">{ev.day}</td>
                  <td>{ev.label}</td>
                  <td className="num">
                    {ev.amount != null && ev.amount > 0 ? fmt2(ev.amount) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
