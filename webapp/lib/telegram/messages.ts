import { currentYm } from "@/lib/finance/helpers";
import {
  expenseCategoryRows,
  loadMonthBudgetSummary,
  type MonthBudgetSummary,
} from "@/lib/telegram/budget";
import { fmtMoney } from "@/lib/telegram/format";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function formatBudgetSummaryMessage(
  supabase: SupabaseClient,
  userId: string,
  ym?: string
): Promise<string> {
  const month = ym ?? currentYm();
  const summary = await loadMonthBudgetSummary(supabase, userId, month);
  return formatBudgetSummaryText(summary, month);
}

export function formatBudgetSummaryText(summary: MonthBudgetSummary, ym: string): string {
  const lines: string[] = [
    `Budget — ${ym}`,
    `Allocated: ${fmtMoney(summary.totals.allocated)}`,
    `Spent: ${fmtMoney(summary.totals.spent)}`,
    `Remaining: ${fmtMoney(summary.totals.remaining)}`,
    "",
    "Categories:",
  ];

  const cats = expenseCategoryRows(summary).slice(0, 12);
  if (cats.length === 0) {
    lines.push("(no budget categories — set up Budget in the app)");
  } else {
    for (const c of cats) {
      lines.push(`• ${c.category}: ${fmtMoney(c.spent)} / ${fmtMoney(c.allocated)} (${fmtMoney(c.remaining)} left)`);
    }
  }

  if (summary.uncategorized.spent > 0) {
    lines.push("", `Uncategorized spent: ${fmtMoney(summary.uncategorized.spent)}`);
  }

  return lines.join("\n");
}

export const HELP_UNLINKED = `Welcome! Link this bot to your SG Finance Planner account:

1. Open the app → Me → Connect Telegram
2. Copy the link code
3. Send /start YOUR_CODE here

Commands: /menu · /budget · /cancel · /skip (when asked for a note)`;

export const HELP_LINKED = `SG Finance Planner bot

/menu — log expense, poker, travel, or poker stats
/budget — this month's summary
/cancel — stop current input`;
