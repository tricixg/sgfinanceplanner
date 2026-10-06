import { addMonthsYmd } from "@/lib/cards/statement-cycle";

export type CycleWindow = {
  start: string;
  /** Exclusive end; null when the benefit never resets. */
  end: string | null;
};

/**
 * Cycle window containing `todayYmd`, given a recurring anchor + length.
 * `cycleMonths` null/0 means the benefit never resets — the window just
 * starts at the anchor and runs forever. The frequency itself drives the
 * step, so a monthly benefit rolls every month, an annual one every 12.
 */
export function currentCycleWindow(
  anchorYmd: string,
  cycleMonths: number | null,
  todayYmd: string
): CycleWindow {
  if (!cycleMonths || cycleMonths <= 0) {
    return { start: anchorYmd, end: null };
  }

  let start = anchorYmd;
  let next = addMonthsYmd(start, cycleMonths);
  while (next <= todayYmd) {
    start = next;
    next = addMonthsYmd(start, cycleMonths);
  }
  return { start, end: next };
}
