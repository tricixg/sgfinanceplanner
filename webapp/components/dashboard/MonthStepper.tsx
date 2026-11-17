"use client";

import { Icon } from "@/components/ui/Icon";
import { addMonthsYm } from "@/lib/finance/calendar";
import { MAX_MONTHS_BACK, monthYear } from "@/lib/dashboard/cashflow";

type Props = {
  /** Month shown, YYYY-MM. */
  ym: string;
  currentYm: string;
  /** Visible period text, e.g. "1–17 Nov 2026" or "Oct 2026". */
  label: string;
  onChange: (ym: string) => void;
};

/** ‹ Month › stepper for the dashboard's single-month view. */
export function MonthStepper({ ym, currentYm, label, onChange }: Props) {
  const prevYm = addMonthsYm(ym, -1);
  const nextYm = addMonthsYm(ym, 1);
  const canPrev = prevYm >= addMonthsYm(currentYm, -MAX_MONTHS_BACK);
  const canNext = ym < currentYm;

  return (
    <div className="month-stepper" role="group" aria-label="Choose month">
      <button
        type="button"
        className="icon-btn month-stepper-btn"
        onClick={() => onChange(prevYm)}
        disabled={!canPrev}
        aria-label={`Previous month, ${monthYear(prevYm)}`}
        title={canPrev ? monthYear(prevYm) : undefined}
      >
        <Icon name="chevron-left" />
      </button>
      <span className="month-stepper-label" aria-live="polite">
        {label}
      </span>
      <button
        type="button"
        className="icon-btn month-stepper-btn"
        onClick={() => onChange(nextYm)}
        disabled={!canNext}
        aria-label={`Next month, ${monthYear(nextYm)}`}
        title={canNext ? monthYear(nextYm) : undefined}
      >
        <Icon name="chevron-right" />
      </button>
      {canNext ? (
        <button
          type="button"
          className="btn ghost sm month-stepper-today"
          onClick={() => onChange(currentYm)}
        >
          This month
        </button>
      ) : null}
    </div>
  );
}
