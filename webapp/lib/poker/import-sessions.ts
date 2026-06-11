import type { SupabaseClient } from "@supabase/supabase-js";
import { loadFinancialAccounts } from "@/lib/financial-accounts/sync";
import { mapPokerSession } from "@/lib/poker/db-mappers";
import { findOrCreatePokerGame } from "@/lib/poker/games";
import { reversePokerLedger } from "@/lib/poker/ledger-sync";
import { parsePokerCsv, type ParsedPokerCsvRow } from "@/lib/poker/parse-csv";
import { resolveSessionFx } from "@/lib/poker/resolve-fx";
import { insertPokerSession, type PokerSessionBody } from "@/lib/poker/save-session";
import type { PokerSession } from "@/lib/poker/types";

export type ImportWarning = { row: number; message: string };

export type ResolvePokerImportResult =
  | {
      ok: true;
      bodies: { rowNumber: number; body: PokerSessionBody; warnings: ImportWarning[] }[];
    }
  | { ok: false; errors: ImportWarning[] };

export type ImportPokerSessionsResult =
  | {
      ok: true;
      imported: number;
      warnings: ImportWarning[];
      sessions: PokerSession[];
      ledgerSynced: boolean;
    }
  | {
      ok: false;
      errors: ImportWarning[];
      rolledBack?: boolean;
      partialCount?: number;
    };

async function resolveCashAccountId(
  supabase: SupabaseClient,
  userId: string,
  accountName: string
): Promise<{ id: string | null; warning: ImportWarning | null }> {
  const name = accountName.trim();
  if (!name) return { id: null, warning: null };

  const accounts = await loadFinancialAccounts(supabase, userId);
  const match = accounts.find(
    (a) =>
      a.accountType === "cash" &&
      a.savingsAccountId &&
      a.name.trim().toLowerCase() === name.toLowerCase()
  );

  if (match) return { id: match.id, warning: null };

  return {
    id: null,
    warning: {
      row: 0,
      message: `Account "${name}" not found — session imported without ledger sync`,
    },
  };
}

function csvRowToBodyBase(row: ParsedPokerCsvRow): PokerSessionBody {
  const body: PokerSessionBody = {
    sessionType: row.sessionType,
    buyIn: row.buyIn,
    playedAt: row.playedAt,
    location: row.location,
    hours: row.hours,
    note: row.note,
    currency: row.currency,
    fxRateManual: row.fxRateManual,
  };

  if (row.fxRateManual && row.fxRateToSgd != null) {
    body.fxRateToSgd = row.fxRateToSgd;
  } else if (!row.fxRateManual && row.fxRateToSgd != null) {
    body.fxRateToSgd = row.fxRateToSgd;
  }

  if (row.sessionType === "cash_game") {
    body.cashOut = row.cashOut;
  }

  if (row.sessionType === "tournament") {
    body.tournamentName = row.tournamentName;
    body.eventName = row.eventName;
    body.tournamentResult = row.tournamentResult ?? undefined;
    body.amountWon = row.amountWon;
    if (row.rebuyAmount > 0) body.rebuyAmount = row.rebuyAmount;
    if (row.bountyAmount > 0) body.bountyAmount = row.bountyAmount;
    body.tournamentPlace = row.tournamentPlace;
    body.tournamentEntries = row.tournamentEntries;
  }

  return body;
}

export async function resolvePokerImportRows(
  supabase: SupabaseClient,
  userId: string,
  csvText: string
): Promise<ResolvePokerImportResult> {
  const parsed = parsePokerCsv(csvText);
  if (parsed.errors.length > 0) {
    return { ok: false, errors: parsed.errors };
  }
  if (parsed.rows.length === 0) {
    return { ok: false, errors: [{ row: 0, message: "No rows to import" }] };
  }

  const bodies: { rowNumber: number; body: PokerSessionBody; warnings: ImportWarning[] }[] = [];
  const errors: ImportWarning[] = [];

  for (const row of parsed.rows) {
    const rowWarnings: ImportWarning[] = [];
    const base = csvRowToBodyBase(row);

    if (row.account) {
      const { id, warning } = await resolveCashAccountId(supabase, userId, row.account);
      if (warning) {
        rowWarnings.push({ ...warning, row: row.rowNumber });
      }
      if (id) base.financialAccountId = id;
    }

    if (row.sessionType === "cash_game") {
      try {
        const game = await findOrCreatePokerGame(supabase, userId, {
          name: row.gameName,
          smallBlind: row.smallBlind!,
          bigBlind: row.bigBlind!,
          ante: row.ante,
        });
        base.gameId = game.id;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to resolve game";
        errors.push({ row: row.rowNumber, message: msg });
        continue;
      }
    }

    const fxResolved = await resolveSessionFx(base, row.playedAt);
    if (!fxResolved.ok) {
      errors.push({ row: row.rowNumber, message: fxResolved.error });
      continue;
    }

    base.currency = fxResolved.fx.currency;
    base.fxRateToSgd = fxResolved.fx.fxRateToSgd;
    base.fxRateManual = fxResolved.fx.fxRateManual;
    const body = base;

    bodies.push({ rowNumber: row.rowNumber, body, warnings: rowWarnings });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  console.info("[poker/import] resolved", { userId, rows: bodies.length });
  return { ok: true, bodies };
}

async function rollbackImportedSessions(
  supabase: SupabaseClient,
  userId: string,
  sessionIds: string[]
): Promise<void> {
  for (const id of sessionIds) {
    const { data: row } = await supabase
      .from("poker_sessions")
      .select("*, poker_games(*)")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!row) continue;

    const session = mapPokerSession(row);
    try {
      await reversePokerLedger(supabase, userId, session);
    } catch (e) {
      console.error("[poker/import] rollback ledger failed", { id, e });
    }

    await supabase.from("poker_sessions").delete().eq("id", id).eq("user_id", userId);
  }
  console.info("[poker/import] rolled back sessions", { count: sessionIds.length });
}

export async function importPokerSessionsFromCsv(
  supabase: SupabaseClient,
  userId: string,
  csvText: string
): Promise<ImportPokerSessionsResult> {
  const resolved = await resolvePokerImportRows(supabase, userId, csvText);
  if (!resolved.ok) {
    return { ok: false, errors: resolved.errors };
  }

  const allWarnings: ImportWarning[] = resolved.bodies.flatMap((b) => b.warnings);
  const createdIds: string[] = [];
  const sessions: PokerSession[] = [];
  let ledgerSynced = false;

  try {
    for (const { body, warnings } of resolved.bodies) {
      allWarnings.push(...warnings);
      const result = await insertPokerSession(supabase, userId, body);
      if ("error" in result) {
        throw new Error(result.error);
      }
      createdIds.push(result.session.id);
      sessions.push(result.session);
      if (result.session.financialAccountId && result.session.savingsTransactionId) {
        ledgerSynced = true;
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Import failed";
    console.error("[poker/import] insert failed, rolling back", {
      userId,
      partialCount: createdIds.length,
      msg,
    });
    await rollbackImportedSessions(supabase, userId, createdIds);
    return {
      ok: false,
      errors: [{ row: 0, message: msg }],
      rolledBack: true,
      partialCount: createdIds.length,
    };
  }

  console.info("[poker/import] completed", {
    userId,
    imported: sessions.length,
    warnings: allWarnings.length,
    ledgerSynced,
  });

  return {
    ok: true,
    imported: sessions.length,
    warnings: allWarnings,
    sessions,
    ledgerSynced,
  };
}
