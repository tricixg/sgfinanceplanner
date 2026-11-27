import type { ReactNode } from "react";
import { daysUntilEndOf, expiryDateLabel, monthLabel } from "@/lib/miles/months";
import { MILES_PROGRAMS } from "@/lib/miles/programs";
import type { MilesTodo } from "@/lib/miles/plan";
import { fmt, fmtFee } from "@/components/miles/format";

type Props = { todos: MilesTodo[]; today: Date };

type Chip = { tone: "urgent" | "risk" | "ok" | "info"; text: string };

function Item({ when, sub, chip, children }: { when: string; sub: string; chip: Chip; children: ReactNode }) {
  return (
    <li>
      <div className="mt-todo-when">
        {when}
        <small>{sub}</small>
      </div>
      <div className="mt-todo-what">{children}</div>
      <span className={`mt-chip ${chip.tone}`}>{chip.text}</span>
    </li>
  );
}

/** Dated to-dos worked out from expiry dates, the 5,000-point blocks and the 3-year KrisFlyer validity. */
export function MilesTodoList({ todos, today }: Props) {
  if (!todos.length) {
    return <p className="note">Nothing to do yet. Log your points below and the next steps appear here.</p>;
  }
  return (
    <ul className="mt-todo">
      {todos.map((t) => {
        if (t.kind === "convert") {
          const rule = MILES_PROGRAMS[t.program];
          const days = daysUntilEndOf(t.month, today);
          return (
            <Item
              key={`c-${t.program}-${t.month}`}
              when={`By 15 ${monthLabel(t.month)}`}
              sub={`expires ${expiryDateLabel(t.month)}`}
              chip={days <= 60 ? { tone: "urgent", text: `${days} days` } : { tone: "ok", text: "Planned" }}
            >
              <b>
                Convert {fmt(t.points)} {rule.unit}
              </b>{" "}
              from {rule.name} into <b>{fmt(t.miles)} KrisFlyer miles</b> for {fmtFee(t.fee)}.
              <span className="mt-sub">
                This saves the {fmt(t.due)} points expiring {expiryDateLabel(t.month)}. Converting the whole block in one go costs
                one fee, and the miles then last until {expiryDateLabel(t.newExpiry)}.
              </span>
            </Item>
          );
        }
        if (t.kind === "short") {
          const rule = MILES_PROGRAMS[t.program];
          return (
            <Item
              key={`s-${t.program}`}
              when={`Before ${expiryDateLabel(t.month)}`}
              sub={rule.short}
              chip={{ tone: "risk", text: "At risk" }}
            >
              <b>
                Earn {fmt(t.need)} more {rule.unit}
              </b>{" "}
              on {rule.name}, or <b>{fmt(t.atRisk)} points expire</b>.
              <span className="mt-sub">
                That leaves {fmt(t.leftover)}, which is under the {fmt(rule.block)} minimum conversion. One more block makes{" "}
                {fmt(rule.block * rule.ratio)} miles.
              </span>
            </Item>
          );
        }
        if (t.kind === "hold") {
          const rule = MILES_PROGRAMS[t.program];
          return (
            <Item key={`h-${t.program}`} when="When you book" sub="no expiry" chip={{ tone: "info", text: "No rush" }}>
              <b>Keep your {fmt(t.balance)} {rule.short} points</b> where they are.
              {t.blocks > 0 ? ` Convert ${fmt(t.blocks * rule.block)} into ${fmt(t.blocks * rule.block * rule.ratio)} miles once you've found award seats.` : ""}
              <span className="mt-sub">
                Converting early only starts the 3-year KrisFlyer clock.
                {t.leftover ? ` ${fmt(t.leftover)} points stay behind until you reach the next ${fmt(rule.block)}.` : ""}
              </span>
            </Item>
          );
        }
        return (
          <Item key="kf" when={expiryDateLabel(t.month)} sub="KrisFlyer" chip={{ tone: "info", text: "Later" }}>
            <b>{fmt(t.amount)} KrisFlyer miles expire.</b>
            <span className="mt-sub">
              Your oldest miles. Use them on a booking before then, since KrisFlyer spends the oldest miles first.
            </span>
          </Item>
        );
      })}
    </ul>
  );
}
