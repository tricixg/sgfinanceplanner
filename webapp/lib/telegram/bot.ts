import { Bot, type Context } from "grammy";
import { getTelegramBotToken, isTelegramConfigured } from "@/lib/telegram/config";
import { getTelegramSupabase } from "@/lib/telegram/supabase";
import {
  clearConversation,
  getConversation,
  setConversation,
} from "@/lib/telegram/conversations";
import { getLinkedUserIdForChat } from "@/lib/telegram/auth-guard";
import { consumeLinkCode, getLinkByChatId } from "@/lib/telegram/links";
import {
  completeFlowWithAccount,
  proceedPokerToAccountStep,
  promptCashAccountStep,
} from "@/lib/telegram/account-step";
import {
  expenseCategoryRows,
  loadMonthBudgetSummary,
} from "@/lib/telegram/budget";
import {
  backToMenuKeyboard,
  expenseCategoryKeyboard,
  pokerCurrencyKeyboard,
  pokerLocationsKeyboard,
  pokerResultKeyboard,
  pokerTypeKeyboard,
  skipNoteKeyboard,
  travelSubcategoryKeyboard,
  travelTripsKeyboard,
  travelYearKeyboard,
} from "@/lib/telegram/keyboards";
import { listPokerLocations } from "@/lib/poker/locations";
import { buildPokerStatsMessage } from "@/lib/telegram/poker-stats-message";
import {
  applyPokerCurrency,
  applyPokerFxRate,
  applyPokerGameSelection,
  applyPokerLocation,
  applyPokerPlayedNow,
  advanceToTournamentBuyInStep,
  advanceToTournamentWonStep,
  afterPokerHours,
  afterTournamentResult,
  finishNewPokerGame,
  promptPokerAnteStep,
  promptPokerHoursStep,
  promptTournamentEntriesStep,
  startNewPokerGameFlow,
  startNewPokerLocationFlow,
  startPokerCashFlow,
  startPokerTournamentFlow,
  tryApplyPokerPlayedAtFromText,
} from "@/lib/telegram/poker-flow";
import { POKER_PROMPTS } from "@/lib/telegram/poker-prompts";
import { showMainMenu } from "@/lib/telegram/menu";
import type { ConversationState } from "@/lib/telegram/conversations";
import {
  formatBudgetSummaryMessage,
  HELP_LINKED,
  HELP_UNLINKED,
} from "@/lib/telegram/messages";
import {
  parseNonNegativeAmount,
  parseNonNegativeHours,
  parsePositiveAmount,
  parsePositiveInt,
} from "@/lib/telegram/format";
import { isRateLimited } from "@/lib/telegram/rate-limit";
import { listTripBudgets } from "@/lib/telegram/travel-data";
import { loadTravelTripsForYear } from "@/lib/telegram/travel-data";
import { currentYm } from "@/lib/finance/helpers";

let botInstance: Bot | null = null;
let botInitPromise: Promise<void> | null = null;

function chatId(ctx: Context): number {
  return ctx.chat?.id ?? 0;
}

async function getLinkedUserId(ctx: Context): Promise<string | null> {
  const supabase = getTelegramSupabase();
  return getLinkedUserIdForChat(supabase, chatId(ctx));
}

async function replyNeedLink(ctx: Context): Promise<void> {
  await ctx.reply(HELP_UNLINKED);
}

async function finishExpenseNote(
  ctx: Context,
  userId: string,
  conv: ConversationState,
  note: string
): Promise<void> {
  const budgetLineId = String(conv.payload.budgetLineId ?? "");
  const amount = Number(conv.payload.amount);
  if (!budgetLineId || !(amount > 0)) {
    await ctx.reply("Expense session expired. Use /menu to start again.");
    await clearConversation(getTelegramSupabase(), chatId(ctx));
    return;
  }
  const accountConv: ConversationState = {
    flow: "expense",
    step: "account",
    payload: { ...conv.payload, note },
  };
  await promptCashAccountStep(ctx, userId, accountConv);
}

async function finishTravelNote(
  ctx: Context,
  userId: string,
  conv: ConversationState,
  note: string
): Promise<void> {
  const tripId = String(conv.payload.tripId ?? "");
  const subCategory = String(conv.payload.subCategory ?? "");
  const amount = Number(conv.payload.amount);
  if (!tripId || !subCategory || !(amount > 0)) {
    await ctx.reply("Travel session expired. Use /menu to start again.");
    await clearConversation(getTelegramSupabase(), chatId(ctx));
    return;
  }
  const next: ConversationState = {
    ...conv,
    step: "note",
    payload: { ...conv.payload, note },
  };
  const accountConv: ConversationState = { ...next, step: "account" };
  await promptCashAccountStep(ctx, userId, accountConv);
}

/** Webhook mode requires `bot.init()` before `handleUpdate`. */
export async function getTelegramBot(): Promise<Bot> {
  if (!botInstance) {
    const token = getTelegramBotToken();
    if (!token) {
      throw new Error("TELEGRAM_BOT_TOKEN not set");
    }
    botInstance = new Bot(token);
    registerHandlers(botInstance);
    botInitPromise = botInstance.init();
    console.info("[telegram] bot initializing");
  }
  await botInitPromise;
  return botInstance;
}

function registerHandlers(bot: Bot): void {
  bot.catch((err) => {
    console.error("[telegram] handler error", err.error ?? err);
  });

  bot.use(async (ctx, next) => {
    const id = chatId(ctx);
    if (id && isRateLimited(id)) {
      await ctx.reply("Too many messages — please wait a minute.");
      return;
    }
    await next();
  });

  bot.command("start", async (ctx) => {
    const supabase = getTelegramSupabase();
    const cid = chatId(ctx);
    const from = ctx.from;
    if (!from || !cid) return;

    const parts = ctx.message?.text?.trim().split(/\s+/) ?? [];
    const code = parts[1];

    if (code) {
      const result = await consumeLinkCode(
        supabase,
        code,
        from.id,
        cid,
        from.username ?? null
      );
      if (!result.ok) {
        await ctx.reply(result.error);
        return;
      }
      await clearConversation(supabase, cid);
      await ctx.reply("Account linked. Use /menu to get started.");
      await showMainMenu(ctx);
      return;
    }

    const existing = await getLinkByChatId(supabase, cid);
    if (existing) {
      await ctx.reply(HELP_LINKED);
      await showMainMenu(ctx);
    } else {
      await ctx.reply(HELP_UNLINKED);
    }
  });

  bot.command("menu", async (ctx) => {
    const userId = await getLinkedUserId(ctx);
    if (!userId) {
      await replyNeedLink(ctx);
      return;
    }
    await showMainMenu(ctx);
  });

  bot.command("budget", async (ctx) => {
    const userId = await getLinkedUserId(ctx);
    if (!userId) {
      await replyNeedLink(ctx);
      return;
    }
    const supabase = getTelegramSupabase();
    const text = await formatBudgetSummaryMessage(supabase, userId);
    await ctx.reply(text);
  });

  bot.command("cancel", async (ctx) => {
    const cid = chatId(ctx);
    if (cid) {
      await clearConversation(getTelegramSupabase(), cid);
    }
    await ctx.reply("Cancelled.");
    const userId = await getLinkedUserId(ctx);
    if (userId) await showMainMenu(ctx);
  });

  bot.command("skip", async (ctx) => {
    const userId = await getLinkedUserId(ctx);
    if (!userId) {
      await replyNeedLink(ctx);
      return;
    }
    const supabase = getTelegramSupabase();
    const cid = chatId(ctx);
    const conv = await getConversation(supabase, cid);
    if (
      conv &&
      conv.step === "hours" &&
      (conv.flow === "poker_cash" || conv.flow === "poker_tour")
    ) {
      await afterPokerHours(ctx, userId, conv, null);
      return;
    }
    if (
      conv &&
      (conv.flow === "poker_cash" || conv.flow === "poker_tour") &&
      conv.step === "note"
    ) {
      await proceedPokerToAccountStep(ctx, userId, { ...conv, payload: { ...conv.payload, note: "" } });
      return;
    }
    if (conv?.flow === "poker_tour" && conv.step === "tplace") {
      await advanceToTournamentWonStep(ctx, {
        ...conv,
        payload: { ...conv.payload, tournamentPlace: null },
      });
      return;
    }
    if (conv?.flow === "poker_tour" && conv.step === "tentries") {
      await advanceToTournamentBuyInStep(ctx, {
        ...conv,
        payload: { ...conv.payload, tournamentEntries: null },
      });
      return;
    }
    if (conv?.flow === "poker_cash" && conv.step === "gante") {
      await finishNewPokerGame(ctx, userId, {
        ...conv,
        payload: { ...conv.payload, gameNewAnte: null },
      });
      return;
    }
    if (
      !conv ||
      (conv.step !== "note" &&
        conv.step !== "tplace" &&
        conv.step !== "tentries" &&
        conv.step !== "gante")
    ) {
      await ctx.reply("Nothing to skip. Use /menu to log an expense or travel cost.");
      return;
    }
    if (conv.flow === "expense") {
      await finishExpenseNote(ctx, userId, conv, "");
      return;
    }
    if (conv.flow === "travel") {
      await finishTravelNote(ctx, userId, conv, "");
    }
  });

  bot.callbackQuery(/^acct:/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = await getLinkedUserId(ctx);
    if (!userId) {
      await replyNeedLink(ctx);
      return;
    }
    const supabase = getTelegramSupabase();
    const cid = chatId(ctx);
    const conv = await getConversation(supabase, cid);
    if (!conv || conv.step !== "account") {
      await ctx.reply("No account step in progress.");
      return;
    }
    const data = ctx.callbackQuery.data;
    const financialAccountId = data === "acct:none" ? null : data.slice("acct:".length);
    const ok = await completeFlowWithAccount(ctx, userId, conv, financialAccountId);
    if (ok) await showMainMenu(ctx);
  });

  bot.callbackQuery("poker:ante:skip", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = await getLinkedUserId(ctx);
    if (!userId) {
      await replyNeedLink(ctx);
      return;
    }
    const supabase = getTelegramSupabase();
    const conv = await getConversation(supabase, chatId(ctx));
    if (!conv || conv.flow !== "poker_cash" || conv.step !== "gante") {
      await ctx.reply("Nothing to skip.");
      return;
    }
    await finishNewPokerGame(ctx, userId, {
      ...conv,
      payload: { ...conv.payload, gameNewAnte: null },
    });
  });

  bot.callbackQuery("hours:skip", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = await getLinkedUserId(ctx);
    if (!userId) {
      await replyNeedLink(ctx);
      return;
    }
    const supabase = getTelegramSupabase();
    const conv = await getConversation(supabase, chatId(ctx));
    if (
      !conv ||
      conv.step !== "hours" ||
      (conv.flow !== "poker_cash" && conv.flow !== "poker_tour")
    ) {
      await ctx.reply("Nothing to skip.");
      return;
    }
    await afterPokerHours(ctx, userId, conv, null);
  });

  bot.callbackQuery("poker:tplace:skip", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = await getLinkedUserId(ctx);
    if (!userId) return replyNeedLink(ctx);
    const conv = await getConversation(getTelegramSupabase(), chatId(ctx));
    if (!conv || conv.flow !== "poker_tour" || conv.step !== "tplace") {
      await ctx.reply("Nothing to skip.");
      return;
    }
    await advanceToTournamentWonStep(ctx, {
      ...conv,
      payload: { ...conv.payload, tournamentPlace: null },
    });
  });

  bot.callbackQuery("poker:tentries:skip", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = await getLinkedUserId(ctx);
    if (!userId) return replyNeedLink(ctx);
    const conv = await getConversation(getTelegramSupabase(), chatId(ctx));
    if (!conv || conv.flow !== "poker_tour" || conv.step !== "tentries") {
      await ctx.reply("Nothing to skip.");
      return;
    }
    await advanceToTournamentBuyInStep(ctx, {
      ...conv,
      payload: { ...conv.payload, tournamentEntries: null },
    });
  });

  bot.callbackQuery("note:skip", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = await getLinkedUserId(ctx);
    if (!userId) {
      await replyNeedLink(ctx);
      return;
    }
    const supabase = getTelegramSupabase();
    const conv = await getConversation(supabase, chatId(ctx));
    if (!conv || conv.step !== "note") {
      await ctx.reply("Nothing to skip.");
      return;
    }
    if (conv.flow === "expense") {
      await finishExpenseNote(ctx, userId, conv, "");
      return;
    }
    if (conv.flow === "travel") {
      await finishTravelNote(ctx, userId, conv, "");
      return;
    }
    if (conv.flow === "poker_cash" || conv.flow === "poker_tour") {
      await proceedPokerToAccountStep(ctx, userId, {
        ...conv,
        payload: { ...conv.payload, note: "" },
      });
    }
  });

  bot.callbackQuery(/^menu:/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = await getLinkedUserId(ctx);
    if (!userId) {
      await replyNeedLink(ctx);
      return;
    }
    const supabase = getTelegramSupabase();
    const cid = chatId(ctx);
    const action = ctx.callbackQuery.data.slice("menu:".length);

    if (action === "main") {
      await clearConversation(supabase, cid);
      await showMainMenu(ctx);
      return;
    }

    if (action === "budget") {
      const text = await formatBudgetSummaryMessage(supabase, userId);
      await ctx.reply(text);
      return;
    }

    if (action === "expense") {
      const summary = await loadMonthBudgetSummary(supabase, userId, currentYm());
      const cats = expenseCategoryRows(summary);
      if (cats.length === 0) {
        await ctx.reply("No budget categories yet. Add them under Budget in the app.");
        return;
      }
      await clearConversation(supabase, cid);
      await ctx.reply("Pick a category:", {
        reply_markup: expenseCategoryKeyboard(cats, 0),
      });
      return;
    }

    if (action === "poker") {
      await clearConversation(supabase, cid);
      await ctx.reply("Session type:", { reply_markup: pokerTypeKeyboard() });
      return;
    }

    if (action === "poker_stats") {
      try {
        const text = await buildPokerStatsMessage(supabase, userId);
        await ctx.reply(text, { reply_markup: backToMenuKeyboard() });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load poker stats";
        console.error("[telegram] poker stats menu failed", msg);
        await ctx.reply(`Could not load poker stats: ${msg}`);
      }
      return;
    }

    if (action === "travel") {
      const y = new Date().getFullYear();
      await clearConversation(supabase, cid);
      await ctx.reply("Pick trip year:", {
        reply_markup: travelYearKeyboard([y, y - 1]),
      });
      return;
    }
  });

  bot.callbackQuery(/^exp:/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = await getLinkedUserId(ctx);
    if (!userId) {
      await replyNeedLink(ctx);
      return;
    }
    const supabase = getTelegramSupabase();
    const cid = chatId(ctx);
    const data = ctx.callbackQuery.data;

    if (data.startsWith("exp:page:")) {
      const page = Number(data.slice("exp:page:".length)) || 0;
      const summary = await loadMonthBudgetSummary(supabase, userId, currentYm());
      const cats = expenseCategoryRows(summary);
      await ctx.editMessageText("Pick a category:", {
        reply_markup: expenseCategoryKeyboard(cats, page),
      });
      return;
    }

    if (data.startsWith("exp:cat:")) {
      const budgetLineId = data.slice("exp:cat:".length);
      const summary = await loadMonthBudgetSummary(supabase, userId, currentYm());
      const cat = expenseCategoryRows(summary).find((c) => c.budgetLineId === budgetLineId);
      if (!cat) {
        await ctx.reply("Category not found.");
        return;
      }
      await setConversation(supabase, cid, {
        flow: "expense",
        step: "amount",
        payload: { budgetLineId, category: cat.category },
      });
      await ctx.reply(`Amount for ${cat.category}? (e.g. 12.50)`);
    }
  });

  bot.callbackQuery(/^poker:/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = await getLinkedUserId(ctx);
    if (!userId) {
      await replyNeedLink(ctx);
      return;
    }
    const supabase = getTelegramSupabase();
    const cid = chatId(ctx);
    const data = ctx.callbackQuery.data;

    if (data === "poker:played:now") {
      const conv = await getConversation(supabase, cid);
      if (
        !conv ||
        (conv.flow !== "poker_cash" && conv.flow !== "poker_tour") ||
        conv.step !== "played_at"
      ) {
        return;
      }
      await applyPokerPlayedNow(ctx, userId, conv);
      return;
    }

    if (data === "poker:cash") {
      await startPokerCashFlow(ctx, userId, cid);
      return;
    }

    if (data === "poker:tour") {
      await startPokerTournamentFlow(ctx, userId, cid);
      return;
    }

    if (data === "poker:loc:skip") {
      const conv = await getConversation(supabase, cid);
      if (
        !conv ||
        (conv.flow !== "poker_cash" && conv.flow !== "poker_tour") ||
        conv.step !== "location"
      ) {
        return;
      }
      await applyPokerLocation(ctx, userId, conv, "");
      return;
    }

    if (data === "poker:loc:new") {
      const conv = await getConversation(supabase, cid);
      if (
        !conv ||
        (conv.flow !== "poker_cash" && conv.flow !== "poker_tour") ||
        conv.step !== "location"
      ) {
        return;
      }
      await startNewPokerLocationFlow(ctx, conv);
      return;
    }

    if (data.startsWith("poker:loc:page:")) {
      const conv = await getConversation(supabase, cid);
      if (
        !conv ||
        (conv.flow !== "poker_cash" && conv.flow !== "poker_tour") ||
        conv.step !== "location"
      ) {
        return;
      }
      const page = Number(data.slice("poker:loc:page:".length)) || 0;
      const locations = await listPokerLocations(supabase, userId);
      await ctx.editMessageText(POKER_PROMPTS.locationPick, {
        reply_markup: pokerLocationsKeyboard(locations, page),
      });
      return;
    }

    if (data.startsWith("poker:loc:")) {
      const conv = await getConversation(supabase, cid);
      if (
        !conv ||
        (conv.flow !== "poker_cash" && conv.flow !== "poker_tour") ||
        conv.step !== "location"
      ) {
        return;
      }
      const encoded = data.slice("poker:loc:".length);
      const location = decodeURIComponent(encoded);
      await applyPokerLocation(ctx, userId, conv, location);
      return;
    }

    if (data.startsWith("poker:cur:page:")) {
      const conv = await getConversation(supabase, cid);
      if (!conv || conv.flow !== "poker_tour" || conv.step !== "currency") {
        return;
      }
      const page = Number(data.slice("poker:cur:page:".length)) || 0;
      await ctx.editMessageText(POKER_PROMPTS.currencyPick, {
        reply_markup: pokerCurrencyKeyboard(page),
      });
      return;
    }

    if (data.startsWith("poker:cur:")) {
      const conv = await getConversation(supabase, cid);
      if (!conv || conv.flow !== "poker_tour" || conv.step !== "currency") {
        return;
      }
      const code = data.slice("poker:cur:".length);
      await applyPokerCurrency(ctx, userId, conv, code);
      return;
    }

    if (data === "poker:game:new") {
      const conv = await getConversation(supabase, cid);
      if (!conv || conv.flow !== "poker_cash" || conv.step !== "game") {
        return;
      }
      await startNewPokerGameFlow(ctx, conv);
      return;
    }

    if (data.startsWith("poker:game:")) {
      const gameId = data.slice("poker:game:".length);
      const conv = await getConversation(supabase, cid);
      if (!conv || conv.flow !== "poker_cash" || conv.step !== "game") {
        return;
      }
      await applyPokerGameSelection(ctx, userId, conv, gameId);
      return;
    }

    if (data === "poker:result:placed" || data === "poker:result:busted") {
      const conv = await getConversation(supabase, cid);
      if (!conv || conv.flow !== "poker_tour" || conv.step !== "result") return;
      const result = data === "poker:result:placed" ? "placed" : "busted";
      await afterTournamentResult(ctx, conv, result);
    }
  });

  bot.callbackQuery(/^travel:/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = await getLinkedUserId(ctx);
    if (!userId) {
      await replyNeedLink(ctx);
      return;
    }
    const supabase = getTelegramSupabase();
    const cid = chatId(ctx);
    const data = ctx.callbackQuery.data;

    if (data.startsWith("travel:year:")) {
      const year = Number(data.slice("travel:year:".length));
      const trips = await loadTravelTripsForYear(supabase, userId, year);
      await setConversation(supabase, cid, {
        flow: "travel",
        step: "trip",
        payload: { year },
      });
      await ctx.reply("Pick trip:", { reply_markup: travelTripsKeyboard(trips) });
      return;
    }

    if (data.startsWith("travel:trip:")) {
      const tripId = data.slice("travel:trip:".length);
      const budgets = await listTripBudgets(supabase, userId, tripId);
      const conv = await getConversation(supabase, cid);
      await setConversation(supabase, cid, {
        flow: "travel",
        step: "sub",
        payload: { ...(conv?.payload ?? {}), tripId },
      });
      if (budgets.length === 0) {
        await ctx.reply("No subcategories on this trip. Edit budgets in the app.");
        return;
      }
      await ctx.reply("Subcategory:", {
        reply_markup: travelSubcategoryKeyboard(budgets),
      });
      return;
    }

    if (data.startsWith("travel:sub:")) {
      const subCategory = decodeURIComponent(data.slice("travel:sub:".length));
      const conv = await getConversation(supabase, cid);
      await setConversation(supabase, cid, {
        flow: "travel",
        step: "amount",
        payload: { ...(conv?.payload ?? {}), subCategory },
      });
      await ctx.reply(`Amount for ${subCategory}?`);
    }
  });

  bot.on("message:text", async (ctx) => {
    const raw = ctx.message.text.trim();
    if (raw.startsWith("/") && !/^\/skip(@\w+)?$/i.test(raw.split(/\s+/)[0] ?? "")) {
      return;
    }

    const userId = await getLinkedUserId(ctx);
    if (!userId) {
      await replyNeedLink(ctx);
      return;
    }

    const supabase = getTelegramSupabase();
    const cid = chatId(ctx);
    const conv = await getConversation(supabase, cid);
    if (!conv?.flow) {
      await ctx.reply("Use /menu or tap a button to start.");
      return;
    }

    const text = ctx.message.text.trim();
    const skip = text.toLowerCase() === "/skip" || text.toLowerCase() === "skip";

    if (conv.flow === "expense") {
      if (conv.step === "amount") {
        const amount = parsePositiveAmount(text);
        if (amount == null) {
          await ctx.reply("Enter a positive number (e.g. 25.00).");
          return;
        }
        await setConversation(supabase, cid, {
          ...conv,
          step: "note",
          payload: { ...conv.payload, amount },
        });
        await ctx.reply("Add a note, tap Skip, or send /skip", {
          reply_markup: skipNoteKeyboard(),
        });
        return;
      }
      if (conv.step === "note") {
        const note = skip ? "" : text;
        await finishExpenseNote(ctx, userId, conv, note);
      }
      return;
    }

    if (conv.flow === "poker_cash" || conv.flow === "poker_tour") {
      if (conv.step === "played_at") {
        await tryApplyPokerPlayedAtFromText(ctx, userId, conv, text);
        return;
      }
      if (conv.step === "loc_new") {
        const name = text.trim();
        if (!name) {
          await ctx.reply("Enter a location name.");
          return;
        }
        await applyPokerLocation(ctx, userId, conv, name);
        return;
      }
    }

    if (conv.flow === "poker_cash" || conv.flow === "poker_tour") {
      if (conv.step === "note") {
        const note = skip ? "" : text;
        await proceedPokerToAccountStep(ctx, userId, {
          ...conv,
          payload: { ...conv.payload, note },
        });
        return;
      }
    }

    if (conv.flow === "poker_cash") {
      if (conv.step === "gname") {
        const name = text.trim();
        if (!name) {
          await ctx.reply(`Enter ${POKER_PROMPTS.gameName.toLowerCase()}`);
          return;
        }
        await setConversation(supabase, cid, {
          ...conv,
          step: "gsb",
          payload: { ...conv.payload, gameNewName: name },
        });
        await ctx.reply(POKER_PROMPTS.gameSmallBlind);
        return;
      }
      if (conv.step === "gsb") {
        const sb = parseNonNegativeAmount(text);
        if (sb == null) {
          await ctx.reply("Enter a valid small blind (0 or more).");
          return;
        }
        await setConversation(supabase, cid, {
          ...conv,
          step: "gbb",
          payload: { ...conv.payload, gameNewSb: sb },
        });
        await ctx.reply(POKER_PROMPTS.gameBigBlind);
        return;
      }
      if (conv.step === "gbb") {
        const bb = parseNonNegativeAmount(text);
        if (bb == null) {
          await ctx.reply("Enter a valid big blind (0 or more).");
          return;
        }
        const withBb: ConversationState = {
          ...conv,
          payload: { ...conv.payload, gameNewBb: bb },
        };
        await promptPokerAnteStep(ctx, withBb);
        return;
      }
      if (conv.step === "gante") {
        if (skip) {
          await finishNewPokerGame(ctx, userId, {
            ...conv,
            payload: { ...conv.payload, gameNewAnte: null },
          });
          return;
        }
        const ante = parseNonNegativeAmount(text);
        if (ante == null) {
          await ctx.reply("Enter ante (0 or more), tap Skip ante, or send /skip.");
          return;
        }
        await finishNewPokerGame(ctx, userId, {
          ...conv,
          payload: { ...conv.payload, gameNewAnte: ante },
        });
        return;
      }
      if (conv.step === "buyin") {
        const buyIn = parsePositiveAmount(text);
        if (buyIn == null) {
          await ctx.reply("Enter a valid buy-in amount.");
          return;
        }
        await setConversation(supabase, cid, {
          ...conv,
          step: "cashout",
          payload: { ...conv.payload, buyIn },
        });
        await ctx.reply(POKER_PROMPTS.cashOut);
        return;
      }
      if (conv.step === "cashout") {
        const cashOut = parseNonNegativeAmount(text);
        if (cashOut == null) {
          await ctx.reply("Enter cash-out (0 or more, e.g. 0 if busted).");
          return;
        }
        const withCashOut: ConversationState = {
          ...conv,
          step: "hours",
          payload: { ...conv.payload, cashOut },
        };
        await setConversation(supabase, cid, withCashOut);
        await promptPokerHoursStep(ctx, userId, withCashOut);
        return;
      }
      if (conv.step === "hours") {
        if (skip) {
          await afterPokerHours(ctx, userId, conv, null);
          return;
        }
        const hours = parseNonNegativeHours(text);
        if (hours == null) {
          await ctx.reply("Enter hours (e.g. 4), tap Skip hours, or send /skip.");
          return;
        }
        await afterPokerHours(ctx, userId, conv, hours);
      }
      return;
    }

    if (conv.flow === "poker_tour") {
      if (conv.step === "fxrate") {
        const rate = parsePositiveAmount(text);
        if (rate == null) {
          await ctx.reply(
            `Enter a valid rate as SGD per 1 ${conv.payload.currency} (e.g. 0.75).`
          );
          return;
        }
        await applyPokerFxRate(ctx, conv, rate);
        return;
      }
      if (conv.step === "tname") {
        const tournamentName = text.trim();
        if (!tournamentName) {
          await ctx.reply("Enter a tournament name.");
          return;
        }
        await setConversation(supabase, cid, {
          ...conv,
          step: "ename",
          payload: { ...conv.payload, tournamentName },
        });
        await ctx.reply(POKER_PROMPTS.tournamentEvent);
        return;
      }
      if (conv.step === "ename") {
        const eventName = text.trim();
        if (!eventName) {
          await ctx.reply("Enter an event name.");
          return;
        }
        await setConversation(supabase, cid, {
          ...conv,
          step: "result",
          payload: { ...conv.payload, eventName },
        });
        await ctx.reply(POKER_PROMPTS.tournamentResult, {
          reply_markup: pokerResultKeyboard(),
        });
        return;
      }
      if (conv.step === "tplace") {
        if (skip) {
          await advanceToTournamentWonStep(ctx, {
            ...conv,
            payload: { ...conv.payload, tournamentPlace: null },
          });
          return;
        }
        const place = parsePositiveInt(text);
        if (place == null) {
          await ctx.reply("Enter place (whole number ≥ 1), or tap Skip place /send /skip.");
          return;
        }
        await advanceToTournamentWonStep(ctx, {
          ...conv,
          payload: { ...conv.payload, tournamentPlace: place },
        });
        return;
      }
      if (conv.step === "twon") {
        const amountWon = parsePositiveAmount(text);
        if (amountWon == null) {
          await ctx.reply("Enter a valid amount won.");
          return;
        }
        const withWon: ConversationState = {
          ...conv,
          payload: { ...conv.payload, amountWon },
        };
        await setConversation(supabase, cid, { ...withWon, step: "tentries" });
        await promptTournamentEntriesStep(ctx, withWon);
        return;
      }
      if (conv.step === "tentries") {
        if (skip) {
          await advanceToTournamentBuyInStep(ctx, {
            ...conv,
            payload: { ...conv.payload, tournamentEntries: null },
          });
          return;
        }
        const entries = parsePositiveInt(text);
        if (entries == null) {
          await ctx.reply("Enter field size (≥ 1), or tap Skip entries /send /skip.");
          return;
        }
        await advanceToTournamentBuyInStep(ctx, {
          ...conv,
          payload: { ...conv.payload, tournamentEntries: entries },
        });
        return;
      }
      if (conv.step === "buyin") {
        const buyIn = parsePositiveAmount(text);
        if (buyIn == null) {
          await ctx.reply("Enter a valid buy-in amount.");
          return;
        }
        const withBuyIn: ConversationState = {
          ...conv,
          step: "hours",
          payload: { ...conv.payload, buyIn },
        };
        await setConversation(supabase, cid, withBuyIn);
        await promptPokerHoursStep(ctx, userId, withBuyIn);
        return;
      }
      if (conv.step === "hours") {
        if (skip) {
          await afterPokerHours(ctx, userId, conv, null);
          return;
        }
        const hours = parseNonNegativeHours(text);
        if (hours == null) {
          await ctx.reply("Enter hours (e.g. 4), tap Skip hours, or send /skip.");
          return;
        }
        await afterPokerHours(ctx, userId, conv, hours);
      }
      return;
    }

    if (conv.flow === "travel") {
      if (conv.step === "amount") {
        const amount = parsePositiveAmount(text);
        if (amount == null) {
          await ctx.reply("Enter a positive amount.");
          return;
        }
        await setConversation(supabase, cid, {
          ...conv,
          step: "note",
          payload: { ...conv.payload, amount },
        });
        await ctx.reply("Add a note, tap Skip, or send /skip", {
          reply_markup: skipNoteKeyboard(),
        });
        return;
      }
      if (conv.step === "note") {
        const note = skip ? "" : text;
        await finishTravelNote(ctx, userId, conv, note);
      }
    }
  });
}

export { isTelegramConfigured };
