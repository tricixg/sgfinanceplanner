import { ProgressBar } from "@/components/ui/ProgressBar";
import { expiryDateLabel, monthLabel, type MonthIndex } from "@/lib/miles/months";
import { CARD_PROGRAMS, MILES_PROGRAMS, programColor } from "@/lib/miles/programs";
import { cardSummary, nextExpiry, type PlanResult } from "@/lib/miles/plan";
import type { MilesLot } from "@/lib/miles/types";
import { fmt } from "@/components/miles/format";

type Props = { lots: MilesLot[]; plan: PlanResult; now: MonthIndex; krisflyer: number };

/** One card per programme: balance, what to do next, and how far to the next 5,000 block. */
export function CardSummaries({ lots, plan, now, krisflyer }: Props) {
  const kfNext = nextExpiry(lots, "krisflyer", now);
  return (
    <div className="mt-cards">
      <div className="mt-pcard">
        <div className="mt-pcard-name">
          <i className="dot" style={{ background: programColor("krisflyer") }} />
          KrisFlyer
        </div>
        <div className="mt-pcard-big">
          {fmt(krisflyer)} <span className="note">miles</span>
        </div>
        <div className="mt-pcard-rule">{MILES_PROGRAMS.krisflyer.rule}</div>
        <div className="mt-pcard-act">
          {kfNext ? `First expiry ${expiryDateLabel(kfNext.month)} (${fmt(kfNext.amount)})` : "Nothing expiring"}
        </div>
      </div>
      {CARD_PROGRAMS.map((p) => {
        const rule = MILES_PROGRAMS[p];
        const s = cardSummary(p, plan, lots, now);
        const action =
          s.action.kind === "convertBy" ? (
            <>
              Convert by <b>15 {monthLabel(s.action.month)}</b>
            </>
          ) : s.action.kind === "reachBlock" ? (
            `Convert once you reach ${fmt(rule.block)}`
          ) : s.action.kind === "whenBooking" ? (
            "Convert when you book"
          ) : (
            "Nothing due"
          );
        return (
          <div className="mt-pcard" key={p}>
            <div className="mt-pcard-name">
              <i className="dot" style={{ background: programColor(p) }} />
              {rule.name}
            </div>
            <div className="mt-pcard-big">
              {fmt(s.balance)} <span className="note">{rule.unit}</span>
            </div>
            <div className="mt-pcard-rule">
              = {fmt(s.convertibleMiles)} miles convertible now · {rule.rule}
            </div>
            <div className="mt-pcard-act">{action}</div>
            <div className="mt-block">
              <div className="mt-block-top">
                <span>
                  <b>{fmt(s.short)}</b> short of the next block
                </span>
                <span className="note">
                  {fmt(s.remainder)} / {fmt(rule.block)}
                </span>
              </div>
              <ProgressBar value={s.remainder / rule.block} size="sm" label={`${fmt(s.remainder)} of ${fmt(rule.block)} towards the next block`} />
              <div className="mt-block-deadline">
                {s.deadline ? (
                  <>
                    Needed by <b>{expiryDateLabel(s.deadline.month)}</b>, or {fmt(s.deadline.atRisk)} {rule.unit} expire
                  </>
                ) : rule.expiryFor ? (
                  "No points at risk"
                ) : (
                  "No deadline, since Altitude points don’t expire"
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
