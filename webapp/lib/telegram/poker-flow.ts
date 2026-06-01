import type { Context } from "grammy";
import { createPokerGame, listPokerGames } from "@/lib/poker/games";
import { listPokerLocations, upsertPokerLocation } from "@/lib/poker/locations";
import type { ConversationState } from "@/lib/telegram/conversations";
import { getConversation, setConversation } from "@/lib/telegram/conversations";
import { parsePokerPlayedAtTelegram } from "@/lib/poker/played-at";
import { sgtNowInputDateTime } from "@/lib/time/sgt";
import {
  pokerGamesKeyboard,
  pokerLocationsKeyboard,
  pokerPlayedAtKeyboard,
  skipAnteKeyboard,
  skipEntriesKeyboard,
  skipHoursKeyboard,
  skipNoteKeyboard,
  skipPlaceKeyboard,
} from "@/lib/telegram/keyboards";
import { POKER_PROMPTS } from "@/lib/telegram/poker-prompts";
import { getTelegramSupabase } from "@/lib/telegram/supabase";

function chatId(ctx: Context): number {
  return ctx.chat?.id ?? 0;
}

export async function startPokerCashFlow(
  ctx: Context,
  userId: string,
  cid: number
): Promise<void> {
  const supabase = getTelegramSupabase();
  await setConversation(supabase, cid, {
    flow: "poker_cash",
    step: "played_at",
    payload: { pokerNext: "cash" },
  });
  await promptPokerPlayedAtStep(ctx);
}

export async function startPokerTournamentFlow(
  ctx: Context,
  userId: string,
  cid: number
): Promise<void> {
  const supabase = getTelegramSupabase();
  await setConversation(supabase, cid, {
    flow: "poker_tour",
    step: "played_at",
    payload: { pokerNext: "tournament" },
  });
  await promptPokerPlayedAtStep(ctx);
}

export async function promptPokerPlayedAtStep(ctx: Context): Promise<void> {
  const supabase = getTelegramSupabase();
  const cid = chatId(ctx);
  const conv = await getConversation(supabase, cid);
  if (!conv || (conv.flow !== "poker_cash" && conv.flow !== "poker_tour")) {
    await ctx.reply("Session expired. Use /menu.");
    return;
  }
  await setConversation(supabase, cid, { ...conv, step: "played_at" });
  await ctx.reply(POKER_PROMPTS.playedAt, { reply_markup: pokerPlayedAtKeyboard() });
}

export async function applyPokerPlayedAt(
  ctx: Context,
  userId: string,
  conv: ConversationState,
  playedAt: string
): Promise<void> {
  const supabase = getTelegramSupabase();
  const cid = chatId(ctx);
  const updated: ConversationState = {
    ...conv,
    payload: { ...conv.payload, playedAt },
  };
  console.log("[telegram] poker played_at set", {
    userId,
    flow: conv.flow,
    playedAt,
  });
  await setConversation(supabase, cid, updated);
  const nextKind = conv.flow === "poker_cash" ? "cash" : "tournament";
  await promptPokerLocationStep(ctx, userId, nextKind);
}

export async function applyPokerPlayedNow(
  ctx: Context,
  userId: string,
  conv: ConversationState
): Promise<void> {
  await applyPokerPlayedAt(ctx, userId, conv, sgtNowInputDateTime());
}

export async function tryApplyPokerPlayedAtFromText(
  ctx: Context,
  userId: string,
  conv: ConversationState,
  text: string
): Promise<boolean> {
  const playedAt = parsePokerPlayedAtTelegram(text);
  if (!playedAt) {
    await ctx.reply(
      "Use format YYYY-MM-DD HH:mm (SGT), e.g. 2026-05-29 14:30, or tap Now."
    );
    return false;
  }
  await applyPokerPlayedAt(ctx, userId, conv, playedAt);
  return true;
}

export async function promptPokerLocationStep(
  ctx: Context,
  userId: string,
  nextKind: "cash" | "tournament"
): Promise<void> {
  const supabase = getTelegramSupabase();
  const cid = chatId(ctx);
  const locations = await listPokerLocations(supabase, userId);
  const conv = await getConversation(supabase, cid);
  if (!conv) {
    await ctx.reply("Session expired. Use /menu.");
    return;
  }

  await setConversation(supabase, cid, {
    ...conv,
    step: "location",
    payload: { ...conv.payload, pokerNext: nextKind },
  });

  console.log("[telegram] poker location step", { userId, count: locations.length, nextKind });
  await ctx.reply(POKER_PROMPTS.locationPick, {
    reply_markup: pokerLocationsKeyboard(locations),
  });
}

export async function applyPokerLocation(
  ctx: Context,
  userId: string,
  conv: ConversationState,
  location: string
): Promise<void> {
  const supabase = getTelegramSupabase();
  const cid = chatId(ctx);
  const trimmed = location.trim();
  if (trimmed) {
    await upsertPokerLocation(supabase, userId, trimmed);
  }

  const nextKind = String(conv.payload.pokerNext ?? "");
  const updated: ConversationState = {
    ...conv,
    payload: { ...conv.payload, location: trimmed },
  };

  if (conv.flow === "poker_cash" || nextKind === "cash") {
    await setConversation(supabase, cid, { ...updated, step: "game" });
    await promptPokerGameStep(ctx, userId);
    return;
  }

  await setConversation(supabase, cid, { ...updated, step: "tname" });
  await ctx.reply(POKER_PROMPTS.tournamentName);
}

export async function promptPokerGameStep(ctx: Context, userId: string): Promise<void> {
  const supabase = getTelegramSupabase();
  const cid = chatId(ctx);
  const games = await listPokerGames(supabase, userId);

  const conv = await getConversation(supabase, cid);
  if (!conv || conv.flow !== "poker_cash") {
    await ctx.reply("Session expired. Use /menu.");
    return;
  }

  await setConversation(supabase, cid, { ...conv, step: "game" });
  console.log("[telegram] poker game step", { userId, gameCount: games.length });

  const hint =
    games.length === 0
      ? `${POKER_PROMPTS.gamePick}\n\nNo saved games yet — tap ＋ New game.`
      : POKER_PROMPTS.gamePick;
  await ctx.reply(hint, { reply_markup: pokerGamesKeyboard(games) });
}

export async function applyPokerGameSelection(
  ctx: Context,
  userId: string,
  conv: ConversationState,
  gameId: string
): Promise<void> {
  const supabase = getTelegramSupabase();
  const cid = chatId(ctx);
  await setConversation(supabase, cid, {
    ...conv,
    step: "buyin",
    payload: { ...conv.payload, gameId },
  });
  console.log("[telegram] poker game selected", { userId, gameId });
  await ctx.reply(POKER_PROMPTS.buyIn);
}

export async function startNewPokerGameFlow(
  ctx: Context,
  conv: ConversationState
): Promise<void> {
  const supabase = getTelegramSupabase();
  const cid = chatId(ctx);
  await setConversation(supabase, cid, {
    ...conv,
    step: "gname",
    payload: { ...conv.payload },
  });
  await ctx.reply(`${POKER_PROMPTS.gameNewIntro}\n\n${POKER_PROMPTS.gameName}`);
}

export async function startNewPokerLocationFlow(
  ctx: Context,
  conv: ConversationState
): Promise<void> {
  const supabase = getTelegramSupabase();
  const cid = chatId(ctx);
  await setConversation(supabase, cid, {
    ...conv,
    step: "loc_new",
    payload: { ...conv.payload },
  });
  await ctx.reply(POKER_PROMPTS.locationNewName);
}

export async function finishNewPokerGame(
  ctx: Context,
  userId: string,
  conv: ConversationState
): Promise<void> {
  const supabase = getTelegramSupabase();
  const name = String(conv.payload.gameNewName ?? "").trim();
  const smallBlind = Number(conv.payload.gameNewSb);
  const bigBlind = Number(conv.payload.gameNewBb);
  const anteRaw = conv.payload.gameNewAnte;

  try {
    const game = await createPokerGame(supabase, userId, {
      name,
      smallBlind,
      bigBlind,
      ante:
        anteRaw === null || anteRaw === ""
          ? null
          : Number(anteRaw),
    });
    console.info("[telegram] poker game created", { userId, gameId: game.id, name });
    await ctx.reply(`Saved game: ${name} (${smallBlind}/${bigBlind}).`);
    await applyPokerGameSelection(ctx, userId, conv, game.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create game";
    console.error("[telegram] create poker game failed", msg);
    await ctx.reply(`Failed: ${msg}. Try again or pick an existing game.`);
    await promptPokerGameStep(ctx, userId);
  }
}

export async function promptPokerAnteStep(ctx: Context, conv: ConversationState): Promise<void> {
  const supabase = getTelegramSupabase();
  const cid = chatId(ctx);
  await setConversation(supabase, cid, {
    ...conv,
    step: "gante",
    payload: conv.payload,
  });
  await ctx.reply(POKER_PROMPTS.gameAnte, { reply_markup: skipAnteKeyboard() });
}

export async function promptTournamentPlaceStep(ctx: Context, conv: ConversationState): Promise<void> {
  const supabase = getTelegramSupabase();
  const cid = chatId(ctx);
  await setConversation(supabase, cid, { ...conv, step: "tplace", payload: conv.payload });
  await ctx.reply(POKER_PROMPTS.tournamentPlace, { reply_markup: skipPlaceKeyboard() });
}

export async function promptTournamentEntriesStep(
  ctx: Context,
  conv: ConversationState
): Promise<void> {
  const supabase = getTelegramSupabase();
  const cid = chatId(ctx);
  await setConversation(supabase, cid, { ...conv, step: "tentries", payload: conv.payload });
  await ctx.reply(POKER_PROMPTS.tournamentEntries, { reply_markup: skipEntriesKeyboard() });
}

export async function promptPokerHoursStep(
  ctx: Context,
  userId: string,
  conv: ConversationState
): Promise<void> {
  const supabase = getTelegramSupabase();
  const cid = chatId(ctx);
  await setConversation(supabase, cid, { ...conv, step: "hours", payload: conv.payload });
  console.log("[telegram] poker hours step", { userId, flow: conv.flow });
  await ctx.reply(POKER_PROMPTS.hours, { reply_markup: skipHoursKeyboard() });
}

export async function promptPokerNoteStep(ctx: Context, conv: ConversationState): Promise<void> {
  const supabase = getTelegramSupabase();
  const cid = chatId(ctx);
  await setConversation(supabase, cid, { ...conv, step: "note", payload: conv.payload });
  await ctx.reply(POKER_PROMPTS.note, { reply_markup: skipNoteKeyboard() });
}

export async function afterPokerHours(
  ctx: Context,
  userId: string,
  conv: ConversationState,
  hours: number | null
): Promise<void> {
  const supabase = getTelegramSupabase();
  const cid = chatId(ctx);
  const payload = { ...conv.payload };
  if (hours != null) payload.hours = hours;
  else payload.hours = null;

  await setConversation(supabase, cid, { ...conv, payload });
  await promptPokerNoteStep(ctx, { ...conv, payload });
}

export async function advanceToTournamentWonStep(
  ctx: Context,
  conv: ConversationState
): Promise<void> {
  const supabase = getTelegramSupabase();
  const cid = chatId(ctx);
  const updated: ConversationState = { ...conv, step: "twon", payload: conv.payload };
  await setConversation(supabase, cid, updated);
  await ctx.reply(POKER_PROMPTS.tournamentAmountWon);
}

export async function advanceToTournamentBuyInStep(
  ctx: Context,
  conv: ConversationState
): Promise<void> {
  const supabase = getTelegramSupabase();
  const cid = chatId(ctx);
  const updated: ConversationState = { ...conv, step: "buyin", payload: conv.payload };
  await setConversation(supabase, cid, updated);
  await ctx.reply(POKER_PROMPTS.buyIn);
}

export async function afterTournamentResult(
  ctx: Context,
  conv: ConversationState,
  result: "placed" | "busted"
): Promise<void> {
  const supabase = getTelegramSupabase();
  const cid = chatId(ctx);
  const updated: ConversationState = {
    ...conv,
    payload: { ...conv.payload, tournamentResult: result },
  };

  if (result === "placed") {
    await setConversation(supabase, cid, updated);
    await promptTournamentPlaceStep(ctx, updated);
    return;
  }

  await setConversation(supabase, cid, { ...updated, step: "tentries" });
  await promptTournamentEntriesStep(ctx, { ...updated, step: "tentries" });
}
