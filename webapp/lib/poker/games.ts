import type { SupabaseClient } from "@supabase/supabase-js";
import { mapPokerGameRow } from "@/lib/poker/db-mappers";
import type { PokerGame } from "@/lib/poker/types";

export async function listPokerGames(
  supabase: SupabaseClient,
  userId: string
): Promise<PokerGame[]> {
  const { data, error } = await supabase
    .from("poker_games")
    .select("*")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapPokerGameRow(r));
}

export async function createPokerGame(
  supabase: SupabaseClient,
  userId: string,
  input: {
    name: string;
    smallBlind: number;
    bigBlind: number;
    ante?: number | null;
  }
): Promise<PokerGame> {
  const name = input.name.trim();
  if (!name) throw new Error("Game name is required");

  const { data, error } = await supabase
    .from("poker_games")
    .insert({
      user_id: userId,
      name,
      small_blind: input.smallBlind,
      big_blind: input.bigBlind,
      ante: input.ante ?? null,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  console.info("[poker] game created", { userId, name, smallBlind: input.smallBlind });
  return mapPokerGameRow(data);
}

/** Match existing game by name + blinds (case-insensitive name); create if missing. */
export async function findOrCreatePokerGame(
  supabase: SupabaseClient,
  userId: string,
  input: {
    name: string;
    smallBlind: number;
    bigBlind: number;
    ante?: number | null;
  }
): Promise<PokerGame> {
  const name = input.name.trim();
  if (!name) throw new Error("Game name is required");

  const { data: existing } = await supabase
    .from("poker_games")
    .select("*")
    .eq("user_id", userId)
    .ilike("name", name)
    .eq("small_blind", input.smallBlind)
    .eq("big_blind", input.bigBlind)
    .limit(1)
    .maybeSingle();

  if (existing) {
    console.info("[poker] game matched", { userId, name, gameId: existing.id });
    return mapPokerGameRow(existing);
  }

  return createPokerGame(supabase, userId, input);
}

export async function updatePokerGame(
  supabase: SupabaseClient,
  userId: string,
  gameId: string,
  input: {
    name: string;
    smallBlind: number;
    bigBlind: number;
    ante?: number | null;
  }
): Promise<PokerGame> {
  const name = input.name.trim();
  if (!name) throw new Error("Game name is required");
  if (!Number.isFinite(input.smallBlind) || input.smallBlind < 0) {
    throw new Error("Valid small blind required");
  }
  if (!Number.isFinite(input.bigBlind) || input.bigBlind < 0) {
    throw new Error("Valid big blind required");
  }

  const { data, error } = await supabase
    .from("poker_games")
    .update({
      name,
      small_blind: input.smallBlind,
      big_blind: input.bigBlind,
      ante: input.ante ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", gameId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  console.info("[poker] game updated", { userId, gameId, name });
  return mapPokerGameRow(data);
}

export async function deletePokerGame(
  supabase: SupabaseClient,
  userId: string,
  gameId: string
): Promise<void> {
  const { count, error: countErr } = await supabase
    .from("poker_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("game_id", gameId);

  if (countErr) throw new Error(countErr.message);
  if ((count ?? 0) > 0) {
    throw new Error("Cannot delete a game that is used by past sessions");
  }

  const { error } = await supabase
    .from("poker_games")
    .delete()
    .eq("id", gameId)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  console.info("[poker] game deleted", { userId, gameId });
}

export async function verifyPokerGame(
  supabase: SupabaseClient,
  userId: string,
  gameId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("poker_games")
    .select("id")
    .eq("id", gameId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return Boolean(data?.id);
}
