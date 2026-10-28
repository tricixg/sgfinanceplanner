import { formatMonthLabel } from "@/lib/finance/helpers";
import { sgtTodayYmd } from "@/lib/time/sgt";

/** Note saved when a recurring payment is recorded with the note left blank: item + month paid. */
export function defaultRecurringNote(name: string, spentAt: string): string {
  const ym = spentAt.slice(0, 7);
  return /^\d{4}-\d{2}$/.test(ym) ? `${name} · ${formatMonthLabel(ym)}` : name;
}

/** Build YYYY-MM-DD for viewed month from day-of-month, clamped to month length. */
export function prefillSpentAt(ym: string, deductionDay: number | null | undefined): string {
  const [y, m] = ym.split("-").map(Number);
  if (!deductionDay || deductionDay < 1 || deductionDay > 31) {
    return sgtTodayYmd();
  }
  const last = new Date(y, m, 0).getDate();
  const day = Math.min(deductionDay, last);
  return `${ym}-${String(day).padStart(2, "0")}`;
}

export function formatDeductionDayLabel(day: number | null | undefined): string {
  if (!day || day < 1 || day > 31) return "—";
  const suffix =
    day >= 11 && day <= 13
      ? "th"
      : day % 10 === 1
        ? "st"
        : day % 10 === 2
          ? "nd"
          : day % 10 === 3
            ? "rd"
            : "th";
  return `${day}${suffix}`;
}
