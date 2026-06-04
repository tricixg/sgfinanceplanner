"use client";

import type { CreditCard } from "@/lib/types";
import { rewardTagClass } from "@/components/credit-cards/card-ui";

type Props = {
  cards: CreditCard[];
};

export function CardListSection({ cards }: Props) {
  return (
    <div className="card table-scroll">
      {cards.length === 0 ? (
        <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
          No credit cards configured. Click Edit to add one.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Card</th>
              <th>Bank</th>
              <th>Rewards</th>
              <th>Interest %</th>
              <th>Stmt day</th>
              <th>Due day</th>
            </tr>
          </thead>
          <tbody>
            {cards.map((c, i) => (
              <tr key={i}>
                <td>{c.name}</td>
                <td>{c.bank ?? "—"}</td>
                <td>
                  {c.rewardHeadline ? (
                    <>
                      <span className={rewardTagClass(c.rewardType)}>
                        {c.rewardType ?? "—"}
                      </span>
                      <div className="note" style={{ marginTop: 4 }}>
                        {c.rewardHeadline}
                      </div>
                    </>
                  ) : (
                    <span style={{ color: "var(--muted)" }}>—</span>
                  )}
                </td>
                <td className="num">{(c.interestRateApr ?? 0).toFixed(2)}</td>
                <td className="num">Day {c.statementDay}</td>
                <td className="num">Day {c.paymentDueDay}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
