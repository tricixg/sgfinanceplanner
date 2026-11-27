"use client";

import { useContext, useMemo, useState } from "react";
import type { DashboardState } from "@/lib/types";
import { AppDataContext } from "@/contexts/app-data-contexts";
import { useMiles } from "@/hooks/useMiles";
import { useDomainLoadError } from "@/hooks/useDomainLoadError";
import { DomainLoadErrorBanner } from "@/components/app/DomainLoadErrorBanner";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SkeletonLines } from "@/components/ui/States";
import { notifySaveFailed } from "@/lib/ui/notify";
import { DEFAULT_MILES_PREFS, KRISFLYER_SAVER_CHART, awardMiles, awardTier } from "@/lib/miles/award-chart";
import { daysUntilEndOf, expiryDateLabel, monthLabel, sgtDayOfMonth, sgtThisMonth } from "@/lib/miles/months";
import {
  averageMonthlyEarn,
  balancesAt,
  buildTodos,
  flightInsights,
  nextExpiry,
  simulateMiles,
  type EarnPerMonth,
} from "@/lib/miles/plan";
import { CARD_PROGRAMS, MILES_PROGRAMS, PROGRAM_ORDER, programColor, type MilesProgram } from "@/lib/miles/programs";
import type { MilesPlannerPrefs, TripType } from "@/lib/miles/types";
import { CardSummaries } from "@/components/miles/CardSummaries";
import { MilesActivityList } from "@/components/miles/MilesActivityList";
import { MilesLedger } from "@/components/miles/MilesLedger";
import { MilesLogPanel } from "@/components/miles/MilesLogPanel";
import { MilesTodoList } from "@/components/miles/MilesTodoList";
import { RedeemChart } from "@/components/miles/RedeemChart";
import { ValidityTimeline } from "@/components/miles/ValidityTimeline";
import { fmt } from "@/components/miles/format";

type Props = {
  state: DashboardState;
  setState: (s: DashboardState | ((p: DashboardState) => DashboardState)) => void;
};

/** Months shown ahead on the charts: long enough to see converted miles expire. */
const HORIZON = 40;

export function TabMiles({ state: S, setState }: Props) {
  const appData = useContext(AppDataContext);
  const miles = useMiles();
  const loadError = useDomainLoadError("miles").error;
  const prefs: MilesPlannerPrefs = S.milesPlanner ?? DEFAULT_MILES_PREFS;

  const now = sgtThisMonth();
  const end = now + HORIZON;
  const today = useMemo(() => new Date(), []);
  const day = sgtDayOfMonth();
  const { lots, activity } = miles;

  // Projected earning: saved figures, else the last 12 months' average for the expiring cards.
  const [earnDraft, setEarnDraft] = useState<EarnPerMonth | null>(null);
  const earn: EarnPerMonth = useMemo(() => {
    const out: EarnPerMonth = {};
    for (const p of PROGRAM_ORDER) {
      out[p] =
        earnDraft?.[p] ??
        prefs.earnPerMonth[p] ??
        (p === "dbs_womans_world" || p === "uob" ? averageMonthlyEarn(lots, p, now) : 0);
    }
    return out;
  }, [earnDraft, prefs.earnPerMonth, lots, now]);

  const plan = useMemo(
    () => simulateMiles(lots, { now, end, plan: true, earnPerMonth: prefs.earnOn ? earn : null }),
    [lots, now, end, prefs.earnOn, earn]
  );
  const base = useMemo(
    () => simulateMiles(lots, { now, end, plan: false, earnPerMonth: prefs.earnOn ? earn : null }),
    [lots, now, end, prefs.earnOn, earn]
  );
  const todos = useMemo(() => buildTodos(plan, lots, now), [plan, lots, now]);
  const target = awardMiles(prefs.targetTier, prefs.trip);
  const tier = awardTier(prefs.targetTier);
  const targetLabel = `${tier.region} ${tier.cabin}, ${prefs.trip === "return" ? "return" : "one-way"}`;
  const insights = useMemo(() => flightInsights(plan, base, target), [plan, base, target]);

  const savePrefs = async (patch: Partial<MilesPlannerPrefs>) => {
    const next = { ...prefs, ...patch };
    try {
      if (appData?.configured) await appData.saveProfile({ milesPlanner: next });
      else setState((prev) => ({ ...prev, milesPlanner: next }));
      console.info("[TabMiles] prefs saved", patch);
    } catch (e) {
      console.error("[TabMiles] prefs save failed", e);
      notifySaveFailed("your miles chart settings", e);
    }
  };

  const balances = balancesAt(lots, now);
  const allMiles = balances.krisflyer + CARD_PROGRAMS.reduce((s, p) => s + balances[p] * MILES_PROGRAMS[p].ratio, 0);
  const kfNext = nextExpiry(lots, "krisflyer", now);
  const soonest = PROGRAM_ORDER.map((p) => ({ p, next: nextExpiry(lots, p, now) }))
    .filter((x): x is { p: MilesProgram; next: { month: number; amount: number } } => x.next !== null)
    .sort((a, b) => a.next.month - b.next.month)[0];
  const soonestDays = soonest ? daysUntilEndOf(soonest.next.month, today) : null;
  const editingBlocked = Boolean(loadError);

  if (miles.loading && !lots.length) {
    return (
      <section className="panel on">
        <SkeletonLines lines={6} label="Loading your miles" />
      </section>
    );
  }

  return (
    <section className="panel on mt-page">
      <DomainLoadErrorBanner domain="miles" />
      {!miles.configured && !loadError ? <p className="note">Sign in to track your miles.</p> : null}

      <div className="grid g4 mt-kpis">
        <div className="stat accent">
          <div className="lbl">Ready to redeem now</div>
          <div className="val">{fmt(plan.months[0]?.total ?? 0)} miles</div>
          <div className="note">KrisFlyer plus full 5,000-point blocks. {fmt(allMiles)} if every point could convert.</div>
        </div>
        <div className="stat">
          <div className="lbl">KrisFlyer balance</div>
          <div className="val">{fmt(balances.krisflyer)} miles</div>
          <div className="note">{kfNext ? `First ${fmt(kfNext.amount)} expire ${expiryDateLabel(kfNext.month)}` : "Nothing expiring"}</div>
        </div>
        <div className="stat">
          <div className="lbl">Card points</div>
          <div className="mt-kpi-points">
            {CARD_PROGRAMS.map((p) => (
              <span key={p}>
                <span>
                  <i className="dot" style={{ background: programColor(p) }} />
                  {MILES_PROGRAMS[p].short}
                </span>
                <b>{fmt(balances[p])}</b>
              </span>
            ))}
          </div>
        </div>
        <div className={`stat${soonestDays !== null && soonestDays <= 60 ? " warn" : ""}`}>
          <div className="lbl">Next points to expire</div>
          <div className="val">{soonest ? expiryDateLabel(soonest.next.month) : "None"}</div>
          {soonest ? (
            <div className="note">
              {fmt(soonest.next.amount)} {MILES_PROGRAMS[soonest.p].unit} · {MILES_PROGRAMS[soonest.p].short} · {soonestDays} days left
            </div>
          ) : null}
        </div>
      </div>

      <div className="section-head">
        <h2>What to do next</h2>
      </div>
      <p className="note mt-intro">
        Worked out from your expiry dates, the 5,000-point conversion blocks and the 3-year KrisFlyer validity you get after converting.
      </p>
      <div className="card">
        <MilesTodoList todos={todos} today={today} />
      </div>

      <div className="section-head">
        <h2>When to convert each card</h2>
      </div>
      <p className="note mt-intro">
        Each bar is one lot, from the month you earned it to the month it expires. A diamond marks a planned conversion. The hatched
        blue bar after it is the new 3-year KrisFlyer life those points get.
      </p>
      <CardSummaries lots={lots} plan={plan} now={now} krisflyer={balances.krisflyer} />
      <div className="card">
        <div className="legend mt-legend">
          {PROGRAM_ORDER.map((p) => (
            <span key={p}>
              <i className="dot" style={{ background: programColor(p) }} />
              {MILES_PROGRAMS[p].name}
            </span>
          ))}
          <span>
            <i className="mt-legend-diamond" />
            Convert
          </span>
          <span>
            <i className="mt-legend-ext" />
            Life after converting
          </span>
        </div>
        <ValidityTimeline lots={lots} plan={plan} now={now} end={end} day={day} />
      </div>

      <div className="section-head">
        <h2>When to redeem for a flight</h2>
      </div>
      <p className="note mt-intro">
        Miles you could put towards an award each month: KrisFlyer miles plus card points in full 5,000-point blocks, at 1 point = 2
        miles. Card points are converted just before they expire.
      </p>
      <div className="card mt-flight">
        <div className="mt-controls">
          <label className="mt-field">
            Award to aim for
            <select value={prefs.targetTier} onChange={(e) => void savePrefs({ targetTier: Number(e.target.value) })}>
              {KRISFLYER_SAVER_CHART.map((t, i) => (
                <option key={`${t.region}-${t.cabin}`} value={i}>
                  {t.region} · {t.cabin} · {fmt(t.milesOneWay * (prefs.trip === "return" ? 2 : 1))}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-field">
            Trip
            <SegmentedControl<TripType>
              label="Trip type"
              value={prefs.trip}
              onChange={(v) => void savePrefs({ trip: v })}
              options={[
                { value: "oneWay", label: "One-way" },
                { value: "return", label: "Return" },
              ]}
            />
          </div>
          <label className="mt-toggle">
            <input type="checkbox" checked={prefs.earnOn} onChange={(e) => void savePrefs({ earnOn: e.target.checked })} />
            Add points I expect to keep earning
          </label>
        </div>
        {prefs.earnOn ? (
          <div className="mt-earn">
            {PROGRAM_ORDER.map((p) => (
              <label key={p} className="mt-field">
                <span>
                  <i className="dot" style={{ background: programColor(p) }} /> {MILES_PROGRAMS[p].short} per month
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={String(earn[p] ?? 0)}
                  onChange={(e) => {
                    const n = Math.max(0, Math.round(Number(e.target.value.replace(/,/g, "")) || 0));
                    setEarnDraft((d) => ({ ...(d ?? {}), [p]: n }));
                  }}
                  onBlur={() => {
                    if (earnDraft) void savePrefs({ earnPerMonth: { ...prefs.earnPerMonth, ...earnDraft } });
                  }}
                />
              </label>
            ))}
            <p className="mt-hint">
              Starts with your average over the last 12 months of logged points. KrisFlyer and Altitude start at 0, so add what you
              expect from flights or spending.
            </p>
          </div>
        ) : null}

        <div className="mt-insights">
          <div className="good">
            <div className="k">Most miles to redeem</div>
            <div className="v">{fmt(insights.peak)} miles</div>
            <div className="d">
              {insights.peakFrom === insights.peakTo
                ? monthLabel(insights.peakFrom)
                : `${monthLabel(insights.peakFrom)} to ${monthLabel(insights.peakTo)}`}
              {insights.firstDrop !== null ? ` · first drop ${monthLabel(insights.firstDrop)}` : ""}
            </div>
          </div>
          <div className="tgt">
            <div className="k">{targetLabel}</div>
            <div className="v">
              {insights.target ? (insights.target.from === now ? "Book now" : `From ${monthLabel(insights.target.from)}`) : "Not reachable yet"}
            </div>
            <div className="d">
              {insights.target
                ? `${fmt(target)} miles · ${insights.target.openEnded ? "stays bookable past" : "bookable until"} ${monthLabel(insights.target.to)}`
                : `You're ${fmt(insights.targetShortBy)} miles short at your peak.`}
            </div>
          </div>
          <div className="bad">
            <div className="k">If you never convert</div>
            <div className="v">{insights.neverConvertGap ? `−${fmt(insights.neverConvertGap.miles)} miles` : "No difference"}</div>
            <div className="d">
              {insights.neverConvertGap
                ? `by ${monthLabel(insights.neverConvertGap.month)}${insights.neverConvertGap.lossesFrom !== null ? `, losses start ${monthLabel(insights.neverConvertGap.lossesFrom)}` : ""}`
                : "Your card points don't expire in this period"}
            </div>
          </div>
        </div>

        <div className="legend mt-legend">
          {PROGRAM_ORDER.map((p) => (
            <span key={p}>
              <i className="dot" style={{ background: programColor(p) }} />
              {p === "krisflyer" ? "KrisFlyer miles" : `${MILES_PROGRAMS[p].short} (converted or convertible)`}
            </span>
          ))}
          <span>
            <i className="mt-legend-line" />
            If you never convert
          </span>
          <span>
            <i className="mt-legend-line target" />
            Award target
          </span>
        </div>
        <RedeemChart plan={plan} base={base} targetMiles={target} targetLabel={targetLabel} />
      </div>

      <div className="section-head">
        <h2>Your logged points</h2>
      </div>
      <p className="note mt-intro">
        Each programme logs the way its bank shows it: KrisFlyer by month earned, Woman&apos;s World by expiry month from the DBS app,
        Altitude as points added, and UOB as your UNI$ balance from the UOB app.
      </p>
      {miles.configured ? (
        <>
          <MilesLogPanel lots={lots} now={now} mutate={miles.mutate} disabled={editingBlocked} />
          <div className="card">
            <h3>Activity</h3>
            <MilesActivityList activity={activity} mutate={miles.mutate} disabled={editingBlocked} />
          </div>
          <MilesLedger lots={lots} now={now} mutate={miles.mutate} disabled={editingBlocked} />
        </>
      ) : null}

      <div className="section-head">
        <h2>Rules this uses</h2>
      </div>
      <div className="card">
        <div className="table-scroll">
          <table className="mt-rules">
            <thead>
              <tr>
                <th>Programme</th>
                <th>Validity</th>
                <th>To KrisFlyer</th>
                <th>Smallest conversion</th>
                <th>Fee per conversion</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>KrisFlyer</td>
                <td>3 years, to the end of the month earned. Converted miles also get 3 years from the conversion month.</td>
                <td>n/a</td>
                <td>n/a</td>
                <td>n/a</td>
              </tr>
              <tr>
                <td>DBS Woman&apos;s World</td>
                <td>1 year from the end of the quarter earned</td>
                <td>1 pt = 2 miles</td>
                <td>5,000 pts = 10,000 miles</td>
                <td>S$27.25</td>
              </tr>
              <tr>
                <td>DBS Altitude</td>
                <td>No expiry. Altitude can also join DBS auto-conversion (500-point blocks, S$43.60 a year).</td>
                <td>1 pt = 2 miles</td>
                <td>5,000 pts = 10,000 miles</td>
                <td>S$27.25</td>
              </tr>
              <tr>
                <td>UOB UNI$</td>
                <td>2 years from the end of the quarter earned. All UOB cards share one pool.</td>
                <td>UNI$1 = 2 miles</td>
                <td>UNI$5,000 = 10,000 miles</td>
                <td>S$27</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="note">
          DBS points stay with the card that earned them, so Woman&apos;s World points can&apos;t top up Altitude points to make a
          block. Check each bank&apos;s current terms before you convert.
        </p>
      </div>
    </section>
  );
}
