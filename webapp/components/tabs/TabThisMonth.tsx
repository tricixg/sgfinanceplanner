"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import type { DashboardState, RecurringSubscription } from "@/lib/types";
import type { CardCalendarCycle } from "@/lib/finance/calendar";
import {
  addMonthsYm,
  attachEventsToGrid,
  buildMonthGrid,
  getCalendarEvents,
  totalStatementAmount,
} from "@/lib/finance/calendar";
import type { CardStatementsBundle } from "@/lib/cards/types";
import { currentYm, fmt, fmt2, formatMonthLabel } from "@/lib/finance/helpers";

type Props = {
  state: DashboardState;
  setState: (s: DashboardState | ((p: DashboardState) => DashboardState)) => void;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function TabThisMonth({ state: S }: Props) {
  const [viewYm, setViewYm] = useState(currentYm);
  const [subscriptions, setSubscriptions] = useState<RecurringSubscription[]>([]);
  const [cardCycles, setCardCycles] = useState<CardCalendarCycle[] | null>(null);
  const [enteredStatementAmounts, setEnteredStatementAmounts] = useState<
    number[] | null
  >(null);
  const todayYm = currentYm();
  const todayDay = new Date().getDate();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { res, data } = await fetchJson<{
        items?: RecurringSubscription[];
        subscriptions?: RecurringSubscription[];
        error?: string;
      }>("/api/recurring-subscriptions", { credentials: "include" });
      if (cancelled) return;
      const list = data.items ?? data.subscriptions ?? [];
      if (res.ok) {
        setSubscriptions(list);
        console.info("[TabThisMonth] subscriptions loaded", list.length);
      } else {
        console.warn("[TabThisMonth] subscriptions load failed", data.error);
        setSubscriptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setCardCycles(null);
    void (async () => {
      const { res, data } = await fetchJson<
        CardStatementsBundle & {
          calendarCycles?: CardCalendarCycle[];
          enteredStatementAmounts?: number[];
          error?: string;
        }
      >(`/api/credit-cards/statements?ym=${viewYm}`, { credentials: "include" });
      if (cancelled) return;
      if (res.ok && data.configured) {
        setCardCycles(data.calendarCycles ?? []);
        setEnteredStatementAmounts(data.enteredStatementAmounts ?? []);
        console.info("[TabThisMonth] card statement cycles loaded", {
          ym: viewYm,
          cycles: data.calendarCycles?.length ?? 0,
        });
      } else {
        console.warn("[TabThisMonth] card statements load failed", data.error);
        setCardCycles([]);
        setEnteredStatementAmounts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewYm]);

  const events = useMemo(
    () => getCalendarEvents(S, viewYm, subscriptions, cardCycles),
    [S, viewYm, subscriptions, cardCycles]
  );
  const grid = useMemo(
    () => attachEventsToGrid(buildMonthGrid(viewYm), events),
    [viewYm, events]
  );
  const stmtTotal = totalStatementAmount(S, enteredStatementAmounts);

  return (
    <section className="panel on">
      <div className="grid g3" style={{ marginBottom: 16 }}>
        <div className="stat accent">
          <div className="lbl">Statement balances (all cards)</div>
          <div className="val">{fmt(stmtTotal)}</div>
          <div className="note">Totals from statement amounts entered on Credit Cards</div>
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
          <span><i style={{ background: "rgba(90,70,120,.25)" }} />Recurring due</span>
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
