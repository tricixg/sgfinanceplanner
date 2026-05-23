/** Build YYYY-MM-DD for viewed month from day-of-month, clamped to month length. */
export function prefillSpentAt(ym: string, deductionDay: number | null | undefined): string {
  const [y, m] = ym.split("-").map(Number);
  if (!deductionDay || deductionDay < 1 || deductionDay > 31) {
    return new Date().toISOString().slice(0, 10);
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
