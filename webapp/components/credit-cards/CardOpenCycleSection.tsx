"use client";

import type { OpenCycleEstimate } from "@/lib/cards/types";
import {
  openCycleDisplayTotal,
  type OpenCycleAggregates,
} from "@/lib/cards/open-cycle-display";
import { fmt2 } from "@/lib/finance/helpers";
import { fmtCardDate } from "@/components/credit-cards/card-ui";

type Props = {
  openCycles: OpenCycleEstimate[];
  openCycleAgg: OpenCycleAggregates;
  excludeCarriedFromOpenCycle: boolean;
  onExcludeCarriedChange: (exclude: boolean) => void;
};

export function CardOpenCycleSection({
  openCycles,
  openCycleAgg,
  excludeCarriedFromOpenCycle,
  onExcludeCarriedChange,
}: Props) {
  if (openCycles.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="section-head" style={{ marginBottom: 12, alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>Open-cycle estimates</h3>
        <label className="open-cycle-toggle">
          <input
            type="checkbox"
            checked={excludeCarriedFromOpenCycle}
            onChange={(e) => {
              onExcludeCarriedChange(e.target.checked);
              console.info("[CardOpenCycleSection] exclude carried", {
                exclude: e.target.checked,
              });
            }}
          />
          Exclude carried
        </label>
      </div>
      <div className="grid g3 card-open-cycle-grid">
        <div className="stat accent">
          <div className="lbl">All cards</div>
          <div className="val">{fmt2(openCycleAgg.displayTotal)}</div>
          <div className="note">
            {openCycleAgg.cardCount} cards · {openCycleAgg.minDaysLeft}d min left
            <br />
            Spend {fmt2(openCycleAgg.newSpend)}
            {!excludeCarriedFromOpenCycle && openCycleAgg.carriedForward > 0
              ? ` · Carried ${fmt2(openCycleAgg.carriedForward)}`
              : ""}
            {excludeCarriedFromOpenCycle && openCycleAgg.carriedForward > 0
              ? ` · Carried ${fmt2(openCycleAgg.carriedForward)} (excluded)`
              : ""}
          </div>
        </div>
        {openCycles.map((o) => {
          const displayTotal = openCycleDisplayTotal(o, excludeCarriedFromOpenCycle);
          return (
            <div className="stat" key={o.creditCardId}>
              <div className="lbl">{o.cardName}</div>
              <div className="val">{fmt2(displayTotal)}</div>
              <div className="note">
                Stmt {fmtCardDate(o.statementCloseDate)} · {o.daysLeftInCycle}d left
                <br />
                Spend {fmt2(o.newSpend)}
                {o.carriedForward > 0
                  ? excludeCarriedFromOpenCycle
                    ? ` · Carried ${fmt2(o.carriedForward)} (excluded)`
                    : ` · Carried ${fmt2(o.carriedForward)}`
                  : ""}
              </div>
            </div>
          );
        })}
      </div>
      <div className="table-scroll" style={{ marginTop: 12 }}>
        <table>
          <thead>
            <tr>
              <th>Card</th>
              <th>Next statement</th>
              <th>Carried</th>
              <th>New spend</th>
              <th>Interest</th>
              <th>Est. total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <b>All cards</b>
              </td>
              <td>
                <div className="note">{openCycleAgg.cardCount} cards</div>
              </td>
              <td className="num">{fmt2(openCycleAgg.carriedForward)}</td>
              <td className="num">{fmt2(openCycleAgg.newSpend)}</td>
              <td className="num">{fmt2(openCycleAgg.interestEstimate)}</td>
              <td className="num">
                <b>{fmt2(openCycleAgg.estimatedTotal)}</b>
              </td>
            </tr>
            {openCycles.map((o) => (
              <tr key={o.creditCardId}>
                <td>{o.cardName}</td>
                <td>
                  {fmtCardDate(o.statementCloseDate)}
                  <div className="note">{o.daysLeftInCycle} days left</div>
                </td>
                <td className="num">{fmt2(o.carriedForward)}</td>
                <td className="num">{fmt2(o.newSpend)}</td>
                <td className="num">{fmt2(o.interestEstimate)}</td>
                <td className="num">
                  <b>{fmt2(o.estimatedTotal)}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
