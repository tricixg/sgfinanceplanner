import { InlineKeyboard } from "grammy";
import type { CategoryBudgetSummary } from "@/lib/expenses/budget-summary";
import type { PokerGame } from "@/lib/poker/types";
import type { AccountPickerOption } from "@/lib/telegram/accounts";
import type { TravelTripSummary } from "@/lib/travel/types";
import { fmtMoney, truncateLabel } from "@/lib/telegram/format";

const PAGE_SIZE = 8;

export function skipNoteKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("Skip note", "note:skip");
}

export function skipHoursKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("Skip hours", "hours:skip");
}

function accountPickerButtonLabel(a: AccountPickerOption): string {
  if (a.accountType === "credit_card") {
    return truncateLabel(`${a.name} (card)`, 40);
  }
  if (a.balance != null) {
    return truncateLabel(`${a.name} — ${fmtMoney(a.balance)}`, 40);
  }
  return truncateLabel(`${a.name} (cash)`, 40);
}

export function accountPickerKeyboard(accounts: AccountPickerOption[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  kb.text("No account (skip ledger)", "acct:none").row();
  for (const a of accounts.slice(0, 10)) {
    kb.text(accountPickerButtonLabel(a), `acct:${a.id}`).row();
  }
  kb.text("Cancel", "menu:main");
  return kb;
}

/** @deprecated Use accountPickerKeyboard */
export const cashAccountKeyboard = accountPickerKeyboard;

export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Log expense", "menu:expense")
    .text("Budget", "menu:budget")
    .row()
    .text("Poker session", "menu:poker")
    .text("Poker stats", "menu:poker_stats")
    .row()
    .text("Travel expense", "menu:travel");
}

export function backToMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("Back to menu", "menu:main");
}

export function expenseCategoryKeyboard(
  categories: CategoryBudgetSummary[],
  page: number
): InlineKeyboard {
  const kb = new InlineKeyboard();
  const start = page * PAGE_SIZE;
  const slice = categories.slice(start, start + PAGE_SIZE);

  for (const cat of slice) {
    const left = cat.remaining;
    const label = truncateLabel(`${cat.category} — ${fmtMoney(left)} left`, 40);
    kb.text(label, `exp:cat:${cat.budgetLineId}`).row();
  }

  const totalPages = Math.max(1, Math.ceil(categories.length / PAGE_SIZE));
  if (totalPages > 1) {
    if (page > 0) kb.text("◀ Prev", `exp:page:${page - 1}`);
    if (page < totalPages - 1) kb.text("Next ▶", `exp:page:${page + 1}`);
    kb.row();
  }
  kb.text("Cancel", "menu:main");
  return kb;
}

export function pokerPlayedAtKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Now", "poker:played:now")
    .row()
    .text("Cancel", "menu:main");
}

export function pokerTypeKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Cash game", "poker:cash")
    .text("Tournament", "poker:tour")
    .row()
    .text("Back", "menu:main");
}

export function pokerLocationsKeyboard(locations: string[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const loc of locations.slice(0, 10)) {
    const encoded = encodeURIComponent(loc);
    kb.text(truncateLabel(loc, 36), `poker:loc:${encoded}`).row();
  }
  kb.text("Skip location", "poker:loc:skip").row();
  kb.text("＋ New location", "poker:loc:new").row();
  kb.text("Cancel", "menu:main");
  return kb;
}

export function pokerGamesKeyboard(games: PokerGame[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const g of games.slice(0, 11)) {
    const stakes = `${g.smallBlind}/${g.bigBlind}`;
    kb.text(truncateLabel(`${g.name} (${stakes})`, 36), `poker:game:${g.id}`).row();
  }
  kb.text("＋ New game", "poker:game:new").row();
  kb.text("Cancel", "menu:main");
  return kb;
}

export function skipAnteKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("Skip ante", "poker:ante:skip");
}

export function skipPlaceKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("Skip place", "poker:tplace:skip");
}

export function skipEntriesKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("Skip entries", "poker:tentries:skip");
}

export function pokerResultKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Placed (ITM)", "poker:result:placed")
    .text("Busted", "poker:result:busted")
    .row()
    .text("Cancel", "menu:main");
}

export function travelYearKeyboard(years: number[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const y of years) {
    kb.text(String(y), `travel:year:${y}`).row();
  }
  kb.text("Cancel", "menu:main");
  return kb;
}

export function travelTripsKeyboard(trips: TravelTripSummary[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const t of trips.slice(0, 10)) {
    const label = truncateLabel(
      `${t.name} (${fmtMoney(t.spent)}/${fmtMoney(t.budgeted)})`,
      40
    );
    kb.text(label, `travel:trip:${t.id}`).row();
  }
  if (trips.length === 0) {
    kb.text("(no trips — use web app)", "menu:main").row();
  }
  kb.text("Cancel", "menu:main");
  return kb;
}

export function travelSubcategoryKeyboard(
  subs: Array<{ subCategory: string }>
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const s of subs) {
    const encoded = encodeURIComponent(s.subCategory);
    kb.text(s.subCategory, `travel:sub:${encoded}`).row();
  }
  kb.text("Cancel", "menu:main");
  return kb;
}
