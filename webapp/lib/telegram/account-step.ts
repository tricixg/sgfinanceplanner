import type { Context } from "grammy";
import { BASE_REPORTING_CURRENCY } from "@/lib/fx/currencies";
import type { PokerSessionBody } from "@/lib/poker/save-session";
import {
  accountPickerKindForFlow,
  loadAccountPickerOptions,
} from "@/lib/telegram/accounts";
import {
  createManualExpense,
  createPokerSessionFromBot,
  createTravelExpense,
} from "@/lib/telegram/actions";
import type { ConversationState } from "@/lib/telegram/conversations";
import { clearConversation, setConversation } from "@/lib/telegram/conversations";
import { fmtMoney } from "@/lib/telegram/format";
import { accountPickerKeyboard } from "@/lib/telegram/keyboards";
import { showMainMenu } from "@/lib/telegram/menu";
import { assertTelegramWriteScope, TelegramScopeError } from "@/lib/telegram/auth-guard";
import { getTelegramSupabase } from "@/lib/telegram/supabase";
import { sgtNowInputDateTime } from "@/lib/time/sgt";

function chatId(ctx: Context): number {
  return ctx.chat?.id ?? 0;
}

function pokerSuccessQuip(profit: number): string {
  if (profit > 0) return "\n\ndamn we eating gooddd";
  if (profit < 0) return "\n\nbetter luck next time :(";
  return "";
}

export function isInsufficientBalanceError(message: string): boolean {
  return (
    message === "Insufficient balance" ||
    message.startsWith("Insufficient balance")
  );
}

function accountStepPrompt(flow: string, retry: boolean): string {
  const prompts: Record<string, string> = {
    expense: "Pay from which account?",
    travel: "Pay from which account?",
    poker_cash: "Which cash account for this session?",
    poker_tour: "Which cash account for this tournament?",
  };
  const base = prompts[flow] ?? "Pick a cash account:";
  if (retry) {
    return `${base}\n\nThat account does not have enough balance — pick another (balances on buttons).`;
  }
  if (flow === "expense" || flow === "travel") {
    return `${base} Cash balances are shown; cards are labeled (card).`;
  }
  return `${base} Each button shows the current balance.`;
}

async function repromptCashAccountStep(
  ctx: Context,
  userId: string,
  conv: ConversationState,
  failedFinancialAccountId: string | null
): Promise<void> {
  const supabase = getTelegramSupabase();
  const cid = chatId(ctx);
  const kind = accountPickerKindForFlow(conv.flow);
  const accounts = await loadAccountPickerOptions(supabase, userId, kind);

  if (accounts.length === 0) {
    await ctx.reply("No accounts available. Use /menu.");
    return;
  }

  await setConversation(supabase, cid, {
    ...conv,
    step: "account",
    payload: conv.payload,
  });

  let prefix = "Insufficient balance.";
  if (failedFinancialAccountId) {
    const failed = accounts.find((a) => a.id === failedFinancialAccountId);
    if (failed) {
      const avail =
        failed.balance != null ? `${fmtMoney(failed.balance)} available` : "not enough funds";
      prefix = `Insufficient balance in ${failed.name} (${avail}).`;
    }
  }

  console.warn("[telegram] insufficient balance — reprompt account", {
    userId,
    flow: conv.flow,
    failedFinancialAccountId,
  });

  await ctx.reply(`${prefix}\n\n${accountStepPrompt(conv.flow, true)}`, {
    reply_markup: accountPickerKeyboard(accounts),
  });
}

function parseHoursFromPayload(payload: Record<string, unknown>): number | null | undefined {
  if (!("hours" in payload)) return undefined;
  if (payload.hours === null || payload.hours === "") return null;
  const h = Number(payload.hours);
  return Number.isFinite(h) && h >= 0 ? h : null;
}

export async function proceedPokerToAccountStep(
  ctx: Context,
  userId: string,
  conv: ConversationState
): Promise<void> {
  const hours = parseHoursFromPayload(conv.payload);
  const hoursVal = hours === undefined ? null : hours;
  let next: ConversationState;

  if (conv.flow === "poker_cash") {
    next = {
      flow: "poker_cash",
      step: "account",
      payload: stashPokerCashForAccount(
        conv.payload,
        String(conv.payload.gameId),
        Number(conv.payload.buyIn),
        Number(conv.payload.cashOut),
        hoursVal
      ),
    };
  } else if (conv.flow === "poker_tour") {
    next = {
      flow: "poker_tour",
      step: "account",
      payload: stashPokerTournamentForAccount(conv.payload, {
        tournamentName: String(conv.payload.tournamentName),
        eventName: String(conv.payload.eventName),
        tournamentResult: conv.payload.tournamentResult as "placed" | "busted",
        buyIn: Number(conv.payload.buyIn),
        amountWon:
          conv.payload.tournamentResult === "placed"
            ? Number(conv.payload.amountWon)
            : undefined,
        hours: hoursVal,
      }),
    };
  } else {
    await ctx.reply("Session expired. Use /menu.");
    return;
  }

  await promptCashAccountStep(ctx, userId, next);
}

function applyOptionalPokerFields(
  body: PokerSessionBody,
  payload: Record<string, unknown>
): void {
  const note = typeof payload.note === "string" ? payload.note.trim() : "";
  if (note) body.note = note;

  if (payload.tournamentPlace != null && payload.tournamentPlace !== "") {
    const place = Number(payload.tournamentPlace);
    if (Number.isFinite(place) && place >= 1) body.tournamentPlace = Math.round(place);
  }
  if (payload.tournamentEntries != null && payload.tournamentEntries !== "") {
    const entries = Number(payload.tournamentEntries);
    if (Number.isFinite(entries) && entries >= 1) {
      body.tournamentEntries = Math.round(entries);
    }
  }
}

/** Telegram poker sessions are always logged in SGD (no currency prompt in bot). */
export function buildPokerBodyFromPayload(
  payload: Record<string, unknown>
): PokerSessionBody | null {
  const sessionType = payload.pokerSessionType as "cash_game" | "tournament" | undefined;
  const hours = parseHoursFromPayload(payload);

  const location =
    typeof payload.location === "string" ? payload.location.trim() : "";

  const sgdDefaults = {
    currency: BASE_REPORTING_CURRENCY,
    fxRateToSgd: 1,
    fxRateManual: false,
  } as const;

  if (sessionType === "cash_game") {
    const body: PokerSessionBody = {
      sessionType: "cash_game",
      gameId: String(payload.gameId ?? ""),
      buyIn: Number(payload.buyIn),
      cashOut: Number(payload.cashOut),
      playedAt: String(payload.playedAt ?? sgtNowInputDateTime()),
      location,
      ...sgdDefaults,
    };
    if (hours != null) body.hours = hours;
    applyOptionalPokerFields(body, payload);
    return body;
  }
  if (sessionType === "tournament") {
    const tournamentResult = payload.tournamentResult as "placed" | "busted";
    const body: PokerSessionBody = {
      sessionType: "tournament",
      tournamentName: String(payload.tournamentName ?? ""),
      eventName: String(payload.eventName ?? ""),
      tournamentResult,
      buyIn: Number(payload.buyIn),
      amountWon: tournamentResult === "placed" ? Number(payload.amountWon) : 0,
      playedAt: String(payload.playedAt ?? sgtNowInputDateTime()),
      location,
      ...sgdDefaults,
    };
    if (hours != null) body.hours = hours;
    applyOptionalPokerFields(body, payload);
    return body;
  }
  return null;
}

export async function promptCashAccountStep(
  ctx: Context,
  userId: string,
  conv: ConversationState,
  prompt?: string
): Promise<void> {
  const supabase = getTelegramSupabase();
  const cid = chatId(ctx);
  const kind = accountPickerKindForFlow(conv.flow);
  const accounts = await loadAccountPickerOptions(supabase, userId, kind);

  if (accounts.length === 0) {
    const emptyMsg =
      conv.flow === "expense" || conv.flow === "travel"
        ? "No pay-from accounts yet. Add cash on ME or a card under Credit Cards in the app. Saving without ledger sync."
        : "No cash accounts with savings linked. Add one under Cash Accounts in the app. Saving without ledger sync.";
    await ctx.reply(emptyMsg);
    const ok = await completeFlowWithAccount(ctx, userId, conv, null);
    if (ok) await showMainMenu(ctx);
    return;
  }

  await setConversation(supabase, cid, {
    ...conv,
    step: "account",
    payload: conv.payload,
  });
  const text = prompt ?? accountStepPrompt(conv.flow, false);
  console.log("[telegram] prompt cash account", {
    userId,
    flow: conv.flow,
    accountCount: accounts.length,
  });
  await ctx.reply(text, { reply_markup: accountPickerKeyboard(accounts) });
}

/** @returns true if the flow finished (caller may show main menu). */
export async function completeFlowWithAccount(
  ctx: Context,
  userId: string,
  conv: ConversationState,
  financialAccountId: string | null
): Promise<boolean> {
  const supabase = getTelegramSupabase();
  const cid = chatId(ctx);

  try {
    await assertTelegramWriteScope(supabase, cid, userId);

    if (conv.flow === "expense") {
      const budgetLineId = String(conv.payload.budgetLineId ?? "");
      const amount = Number(conv.payload.amount);
      const note = String(conv.payload.note ?? "");
      if (!budgetLineId || !(amount > 0)) {
        await ctx.reply("Expense session expired. Use /menu.");
        await clearConversation(supabase, cid);
        return false;
      }
      const result = await createManualExpense(supabase, userId, cid, {
        budgetLineId,
        amount,
        note,
        financialAccountId,
      });
      if (!result.ok) {
        if (financialAccountId && isInsufficientBalanceError(result.error)) {
          await repromptCashAccountStep(ctx, userId, conv, financialAccountId);
          return false;
        }
        await clearConversation(supabase, cid);
        await ctx.reply(`Failed: ${result.error}`);
        return false;
      }
      await clearConversation(supabase, cid);
      const ledger = financialAccountId ? " Ledger updated." : "";
      await ctx.reply(
        `Logged ${fmtMoney(amount)} to ${result.category}. ${fmtMoney(result.remaining)} left this month.${ledger}`
      );
      return true;
    }

    if (conv.flow === "travel") {
      const tripId = String(conv.payload.tripId ?? "");
      const subCategory = String(conv.payload.subCategory ?? "");
      const amount = Number(conv.payload.amount);
      const note = String(conv.payload.note ?? "");
      const result = await createTravelExpense(supabase, userId, cid, tripId, {
        amount,
        subCategory,
        note,
        spentAt: sgtNowInputDateTime(),
        financialAccountId,
      });
      if (!result.ok) {
        if (financialAccountId && isInsufficientBalanceError(result.error)) {
          await repromptCashAccountStep(ctx, userId, conv, financialAccountId);
          return false;
        }
        await clearConversation(supabase, cid);
        await ctx.reply(`Failed: ${result.error}`);
        return false;
      }
      await clearConversation(supabase, cid);
      const ledger = financialAccountId ? " Ledger updated." : "";
      await ctx.reply(`Logged ${fmtMoney(amount)} to ${result.tripName} · ${subCategory}.${ledger}`);
      return true;
    }

    if (conv.flow === "poker_cash" || conv.flow === "poker_tour") {
      const body = buildPokerBodyFromPayload(conv.payload);
      if (!body) {
        await ctx.reply("Session expired. Use /menu.");
        await clearConversation(supabase, cid);
        return false;
      }
      if (financialAccountId) {
        body.financialAccountId = financialAccountId;
      }
      const result = await createPokerSessionFromBot(supabase, userId, cid, body);
      if (!result.ok) {
        if (financialAccountId && isInsufficientBalanceError(result.error)) {
          await repromptCashAccountStep(ctx, userId, conv, financialAccountId);
          return false;
        }
        await clearConversation(supabase, cid);
        await ctx.reply(`Failed: ${result.error}`);
        return false;
      }
      await clearConversation(supabase, cid);
      const ledger = financialAccountId ? " Ledger updated." : "";
      const quip = pokerSuccessQuip(result.profit);
      console.info("[telegram] poker session saved", {
        userId,
        profit: result.profit,
        financialAccountId,
      });
      await ctx.reply(`Poker session saved. P/L: ${fmtMoney(result.profit)}.${ledger}${quip}`);
      return true;
    }

    await ctx.reply("Nothing to save.");
    return false;
  } catch (e) {
    if (e instanceof TelegramScopeError) {
      console.error("[telegram] completeFlowWithAccount scope denied", { flow: conv.flow });
      await clearConversation(supabase, cid);
      await ctx.reply("Account not linked. Use /start with your link code from the app.");
      return false;
    }
    const msg = e instanceof Error ? e.message : "Save failed";
    console.error("[telegram] completeFlowWithAccount failed", { flow: conv.flow, msg });
    if (financialAccountId && isInsufficientBalanceError(msg)) {
      await repromptCashAccountStep(ctx, userId, conv, financialAccountId);
      return false;
    }
    await clearConversation(supabase, cid);
    await ctx.reply(`Failed: ${msg}`);
    return false;
  }
}

export function stashPokerCashForAccount(
  payload: Record<string, unknown>,
  gameId: string,
  buyIn: number,
  cashOut: number,
  hours?: number | null
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    ...payload,
    pokerSessionType: "cash_game",
    gameId,
    buyIn,
    cashOut,
    playedAt: String(payload.playedAt ?? sgtNowInputDateTime()),
  };
  if (hours != null && Number.isFinite(hours) && hours >= 0) {
    base.hours = hours;
  }
  return base;
}

export function stashPokerTournamentForAccount(
  payload: Record<string, unknown>,
  fields: {
    tournamentName: string;
    eventName: string;
    tournamentResult: "placed" | "busted";
    buyIn: number;
    amountWon?: number;
    hours?: number | null;
  }
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    ...payload,
    pokerSessionType: "tournament",
    tournamentName: fields.tournamentName,
    eventName: fields.eventName,
    tournamentResult: fields.tournamentResult,
    buyIn: fields.buyIn,
    amountWon: fields.amountWon ?? 0,
    playedAt: String(payload.playedAt ?? sgtNowInputDateTime()),
  };
  if (fields.hours != null && Number.isFinite(fields.hours) && fields.hours >= 0) {
    base.hours = fields.hours;
  }
  return base;
}
