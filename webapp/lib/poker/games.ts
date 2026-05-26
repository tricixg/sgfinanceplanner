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
