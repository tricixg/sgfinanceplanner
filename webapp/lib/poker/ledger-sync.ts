import type { SupabaseClient } from "@supabase/supabase-js";
import { loadFinancialAccount } from "@/lib/expenses/auto-payment";
import { findIncomeCategoryBySlug } from "@/lib/income/load";
import { applyTransaction } from "@/lib/savings/ledger";
import { pokerProfit, sessionGameLabel } from "@/lib/poker/types";
import type { PokerSession } from "@/lib/poker/types";

export function pokerLedgerNote(session: PokerSession): string {
  const loc = session.location.trim();
  const game = sessionGameLabel(session);
  const parts = ["Poker"];
  if (session.sessionType === "tournament") {
    const tName = session.tournamentName?.trim();
    if (tName) parts.push(tName);
  }
  if (game !== "—") parts.push(game);
  if (loc) parts.push(`@ ${loc}`);
  if (parts.length === 1) return `Poker session ${session.playedAt}`;
  return parts.join(" · ");
}

export async function createPokerLedger(
  supabase: SupabaseClient,
  userId: string,
  session: PokerSession
): Promise<string | null> {
  if (!session.financialAccountId) {
    console.info("[poker-ledger] skip — no account", { sessionId: session.id });
    return null;
  }

  const profit = pokerProfit(session);
  if (profit === 0) {
    console.info("[poker-ledger] skip — zero profit", { sessionId: session.id });
    return null;
  }

  const account = await loadFinancialAccount(
    supabase,
    userId,
    session.financialAccountId
  );
  if (!account?.savingsAccountId) {
    throw new Error("Poker account must be a cash account linked to savings");
  }

  const note = pokerLedgerNote(session);
  const occurredAt = `${session.playedAt}T12:00:00.000Z`;

  if (profit > 0) {
    const pokerCat = await findIncomeCategoryBySlug(supabase, userId, "poker");
    if (!pokerCat) {
      throw new Error("Poker income category not found");
    }
    const tx = await applyTransaction(supabase, {
      userId,
      accountId: account.savingsAccountId,
      amount: profit,
      kind: "deposit",
      occurredAt,
      note,
      incomeCategoryId: pokerCat.id,
    });
    console.info("[poker-ledger] deposit created", {
      sessionId: session.id,
      profit,
      txId: tx.id,
    });
    return tx.id;
  }

  const tx = await applyTransaction(supabase, {
    userId,
    accountId: account.savingsAccountId,
    amount: -Math.abs(profit),
    kind: "withdrawal",
    occurredAt,
    note,
    excludeFromBudget: true,
  });
  console.info("[poker-ledger] withdrawal created", {
    sessionId: session.id,
    loss: Math.abs(profit),
    txId: tx.id,
  });
  return tx.id;
}

export async function reversePokerLedger(
  supabase: SupabaseClient,
  userId: string,
  session: PokerSession
): Promise<void> {
  if (!session.savingsTransactionId) return;

  const { data: row, error } = await supabase
    .from("savings_transactions")
    .select("id, account_id, amount, kind")
    .eq("id", session.savingsTransactionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) return;

  const accountId = row.account_id ? String(row.account_id) : null;
  if (!accountId) return;

  const originalAmount = Number(row.amount ?? 0);
  const restoreAmount = -originalAmount;
  if (restoreAmount === 0) return;

  await applyTransaction(supabase, {
    userId,
    accountId,
    amount: restoreAmount,
    kind: "deposit",
    occurredAt: new Date().toISOString(),
    note: `Reversal: ${pokerLedgerNote(session)}`,
  });

  const { error: delErr } = await supabase
    .from("savings_transactions")
    .delete()
    .eq("id", row.id)
    .eq("user_id", userId);

  if (delErr) throw new Error(delErr.message);

  console.info("[poker-ledger] reversed", {
    sessionId: session.id,
    txId: row.id,
    restoreAmount,
  });
}
