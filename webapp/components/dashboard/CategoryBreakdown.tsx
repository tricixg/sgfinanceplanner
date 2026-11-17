"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { colorAt } from "@/components/spending/chart-colors";
import {
  OTHER_ID,
  categoryTransactionsHref,
  type RangeWindow,
  type RankedShare,
} from "@/lib/dashboard/cashflow";
import { fmt } from "@/lib/finance/helpers";

type Props = {
  rows: RankedShare[];
  window: RangeWindow;
  /** Human period label, used in accessible names. */
  periodText: string;
  /** Dashboard URL to come back to from Transactions. */
  backHref: string;
};

type RowProps = {
  row: RankedShare;
  color: string;
  /** Amount that fills the bar completely (the largest row). */
  scale: number;
  window: RangeWindow;
  periodText: string;
  backHref: string;
};

function RowBody({ row, color, scale }: Pick<RowProps, "row" | "color" | "scale">) {
  return (
    <>
      <div className="rank-name">
        <span className="dot" style={{ background: color }} />
        <span>{row.label}</span>
      </div>
      <div className="rank-val">
        {fmt(row.amount)}
        <small>{Math.round(row.share * 100)}%</small>
      </div>
      <div className="rank-bar">
        <i style={{ width: `${scale > 0 ? (row.amount / scale) * 100 : 0}%`, background: color }} />
      </div>
    </>
  );
}

function CategoryLink({ row, color, scale, window, periodText, backHref }: RowProps) {
  return (
    <Link
      href={categoryTransactionsHref(row, window, backHref)}
      className="rank-row rank-link"
      aria-label={`${row.label}, ${fmt(row.amount)}, ${Math.round(
        row.share * 100
      )}% of spending. View transactions for ${periodText}`}
    >
      <RowBody row={row} color={color} scale={scale} />
      <Icon name="chevron-right" className="rank-chev" />
    </Link>
  );
}

/** Ranked spending categories; each opens Transactions filtered to it and the period. */
export function CategoryBreakdown({ rows, window, periodText, backHref }: Props) {
  const [otherOpen, setOtherOpen] = useState(false);
  const subId = useId();
  const scale = rows[0]?.amount ?? 0;
  const linkProps = { window, periodText, backHref };

  return (
    <div className="rank">
      {rows.map((row, i) => {
        if (row.id !== OTHER_ID) {
          return (
            <CategoryLink key={row.id} row={row} color={colorAt(i)} scale={scale} {...linkProps} />
          );
        }
        const children = row.children ?? [];
        return (
          <div key={row.id} className={`rank-group ${otherOpen ? "open" : ""}`}>
            <button
              type="button"
              className="rank-row rank-link rank-toggle"
              aria-expanded={otherOpen}
              aria-controls={subId}
              onClick={() => setOtherOpen((v) => !v)}
            >
              <RowBody row={row} color="var(--muted)" scale={scale} />
              <Icon name="chevron-down" className="rank-chev" />
            </button>
            <div className="rank-sub" id={subId} hidden={!otherOpen}>
              {children.map((child) => (
                <CategoryLink
                  key={child.id}
                  row={child}
                  color="var(--sand)"
                  scale={scale}
                  {...linkProps}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
