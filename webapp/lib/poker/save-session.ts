import type { SupabaseClient } from "@supabase/supabase-js";
import { mapPokerSession } from "@/lib/poker/db-mappers";
import { verifyPokerGame } from "@/lib/poker/games";
import { createPokerLedger, resyncPokerLedger } from "@/lib/poker/ledger-sync";
import { upsertPokerLocation } from "@/lib/poker/locations";
import {
  parsePokerSessionBody,
  pokerSessionRowFromParsed,
  type PokerSessionBody,
} from "@/lib/poker/session-input";

export type { PokerSessionBody } from "@/lib/poker/session-input";
import type { PokerSession } from "@/lib/poker/types";
import { pokerProfit } from "@/lib/poker/types";

export async function insertPokerSession(
  supabase: SupabaseClient,
  userId: string,
  body: PokerSessionBody
): Promise<{ session: PokerSession } | { error: string }> {
  const parsed = parsePokerSessionBody(body);
  if (!parsed.ok) return { error: parsed.error };

  const data = parsed.data;
  if (data.sessionType === "cash_game") {
    const ok = await verifyPokerGame(supabase, userId, data.gameId!);
    if (!ok) return { error: "Invalid game" };
  }

  if (data.location) {
    await upsertPokerLocation(supabase, userId, data.location);
  }

  const { data: row, error } = await supabase
    .from("poker_sessions")
    .insert({
      user_id: userId,
      ...pokerSessionRowFromParsed(data),
    })
    .select("*, poker_games(*)")
    .single();

  if (error) {
    console.error("[poker] insert failed", error.message);
    return { error: error.message };
  }

  let session = mapPokerSession(row);
  const profit = pokerProfit(session);

  if (profit !== 0) {
    try {
      const txId = await createPokerLedger(supabase, userId, session);
      if (txId) {
        const { data: updated } = await supabase
          .from("poker_sessions")
          .update({ savings_transaction_id: txId })
          .eq("id", session.id)
          .select("*, poker_games(*)")
          .single();
        if (updated) session = mapPokerSession(updated);
      }
    } catch (ledgerErr) {
      await supabase.from("poker_sessions").delete().eq("id", session.id);
      const msg = ledgerErr instanceof Error ? ledgerErr.message : "Ledger sync failed";
      console.error("[poker] insert ledger failed", msg);
      return { error: msg };
    }
  }

  console.info("[poker] session created", {
    userId,
    sessionId: session.id,
    profit,
  });
  return { session };
}

export async function updatePokerSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  body: PokerSessionBody
): Promise<{ session: PokerSession } | { error: string }> {
  const parsed = parsePokerSessionBody(body);
  if (!parsed.ok) return { error: parsed.error };

  const data = parsed.data;
  if (data.sessionType === "cash_game") {
    const ok = await verifyPokerGame(supabase, userId, data.gameId!);
    if (!ok) return { error: "Invalid game" };
  }

  const { data: existingRow, error: fetchErr } = await supabase
    .from("poker_sessions")
    .select("*, poker_games(*)")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchErr) return { error: fetchErr.message };
  if (!existingRow) return { error: "Not found" };

  const previous = mapPokerSession(existingRow);

  if (data.location) {
    await upsertPokerLocation(supabase, userId, data.location);
  }

  const { data: row, error: updateErr } = await supabase
    .from("poker_sessions")
    .update({
      ...pokerSessionRowFromParsed(data),
      savings_transaction_id: null,
    })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .select("*, poker_games(*)")
    .single();

  if (updateErr) {
    console.error("[poker] update failed", updateErr.message);
    return { error: updateErr.message };
  }

  let session = mapPokerSession(row);

  try {
    const txId = await resyncPokerLedger(supabase, userId, previous, session);
    if (txId) {
      const { data: withTx } = await supabase
        .from("poker_sessions")
        .update({ savings_transaction_id: txId })
        .eq("id", sessionId)
        .select("*, poker_games(*)")
        .single();
      if (withTx) session = mapPokerSession(withTx);
    }
  } catch (ledgerErr) {
    const msg = ledgerErr instanceof Error ? ledgerErr.message : "Ledger sync failed";
    console.error("[poker] update ledger failed", { sessionId, msg });
    return { error: msg };
  }

  console.info("[poker] session updated", {
    userId,
    sessionId,
    profit: pokerProfit(session),
  });
  return { session };
}
