"use client";

import { OW_CEIL, type BtoIncomeGoal } from "@/lib/finance";
import { fmt } from "@/lib/finance/helpers";

type Props = {
  goal: BtoIncomeGoal;
  /** Combined monthly salary today. */
  incomeNow: number;
  neededKC: number;
  /** Cash still needed at key collection beyond any a bank loan requires. */
  shortfallKC: number;
  cashAFL: number;
  keysLabel: string;
  aflLabel: string;
};

/**
 * Income goal tables for paying key collection fully from CPF — a steady
 * yearly raise, or a single raise in a given January. Shown by the price
 * finder only when today's income can't get there.
 */
export function BtoIncomeGoalCard({
  goal,
  incomeNow,
  neededKC,
  shortfallKC,
  cashAFL,
  keysLabel,
  aflLabel,
}: Props) {
  const { yearly } = goal;
  const lastYear = yearly.reachable ? yearly.years[yearly.years.length - 1] : null;

  return (
    <div className="card bto-pf-goal">
      <div className="bto-pf-chart-head">
        <span className="stat-lbl">Income goal to pay keys fully from CPF</span>
        <span className="note">Raises each January · same % for both of you</span>
      </div>

      {!goal.raiseNeeded ? (
        <p className="bto-pf-goal-sum">
          Today&apos;s income already gets CPF OA to the {fmt(neededKC)} keys bill by {keysLabel}.
        </p>
      ) : !yearly.reachable ? (
        <p className="bto-pf-goal-sum">
          Even with both salaries at the CPF salary cap ({fmt(OW_CEIL)}/mo each) from January,
          pooled OA only reaches <b>{fmt(yearly.maxedBalance)}</b> by {keysLabel}, short of the{" "}
          <b>{fmt(neededKC)}</b> keys bill. Raises alone can&apos;t close this gap: it needs cash, a
          lower price, or later keys.
        </p>
      ) : (
        <>
          <p className="bto-pf-goal-sum">
            Reach a combined <b>{fmt(lastYear!.income)}/mo</b> by {lastYear!.year} (raises of about{" "}
            <b>{yearly.growthPct.toFixed(1)}% a year</b> each January) and pooled OA covers the{" "}
            <b>{fmt(neededKC)}</b> keys bill on {keysLabel}. On today&apos;s income you&apos;re{" "}
            <b>{fmt(shortfallKC)}</b> short.
          </p>
          <div className="bto-timeline-table-scroll">
            <table className="bto-pf-table bto-pf-goal-table">
              <thead>
                <tr>
                  <th>Year</th>
                  <th className="num">Combined income</th>
                  <th className="num">vs today</th>
                  <th className="num">CPF OA in</th>
                  <th className="num">Pooled OA</th>
                  <th>Toward keys bill</th>
                </tr>
              </thead>
              <tbody>
                {yearly.years.map((y, i) => {
                  const isKeys = i === yearly.years.length - 1;
                  const pct = Math.max(0, Math.min(100, (y.balance / neededKC) * 100));
                  return (
                    <tr key={y.year} className={isKeys ? "keys" : ""}>
                      <td>
                        {y.year}
                        {isKeys ? " · keys" : i === 0 ? " · now" : ""}
                      </td>
                      <td className="num">{fmt(y.income)}/mo</td>
                      <td className="num">{i === 0 ? "—" : `+${fmt(y.income - incomeNow)}`}</td>
                      <td className="num">{fmt(y.oaMonthly)}/mo</td>
                      <td className="num">{fmt(y.balance)}</td>
                      <td>
                        <div className="bto-pf-bar" title={`${pct.toFixed(0)}%`}>
                          <i style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="bto-pf-chart-head" style={{ marginTop: 22 }}>
            <span className="stat-lbl">Or one raise, then hold</span>
            <span className="note">From January of that year</span>
          </div>
          <p className="bto-pf-goal-sum">
            If you only get one raise before keys, this is the combined income you&apos;d need from
            that January onwards. The later it comes, the bigger it has to be.
          </p>
          <div className="bto-timeline-table-scroll">
            <table className="bto-pf-table bto-pf-goal-table">
              <thead>
                <tr>
                  <th>Raise in</th>
                  <th className="num">Combined income</th>
                  <th className="num">vs today</th>
                  <th className="num">Raise</th>
                  <th className="num">CPF OA in</th>
                </tr>
              </thead>
              <tbody>
                {goal.oneRaise.map((r) =>
                  r.reachable ? (
                    <tr key={r.year}>
                      <td>Jan {r.year}</td>
                      <td className="num">{fmt(r.income)}/mo</td>
                      <td className="num">+{fmt(r.income - incomeNow)}</td>
                      <td className="num">+{r.raisePct.toFixed(1)}%</td>
                      <td className="num">{fmt(r.oaMonthly)}/mo</td>
                    </tr>
                  ) : (
                    <tr key={r.year}>
                      <td>Jan {r.year}</td>
                      <td colSpan={4} className="neg">
                        Too late: even at the CPF salary cap, OA can&apos;t catch up by keys
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {goal.hitsSalaryCeiling && (
        <p className="bto-pf-goal-warn">
          CPF contributions stop rising above {fmt(OW_CEIL)}/mo salary per person, so the goal holds
          each salary there once it reaches it.
        </p>
      )}
      {cashAFL > 0 && (
        <p className="bto-pf-goal-warn">
          The AFL payment on {aflLabel} is still {fmt(cashAFL)} short. That&apos;s too soon for
          raises to help, so plan that as cash.
        </p>
      )}
    </div>
  );
}
