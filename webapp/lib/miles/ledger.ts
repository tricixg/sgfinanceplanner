import type { SupabaseClient } from "@supabase/supabase-js";
import { parseClientRequestId } from "@/lib/api/idempotency";
import { monthFromYmd, monthToYmd } from "@/lib/miles/months";
import { isCardProgram, isMilesProgram, type CardProgram, type MilesProgram } from "@/lib/miles/programs";
import { callLedgerRpc } from "@/lib/supabase/rpc";

/** Migration that adds the miles tables and functions used below. */
export const MILES_LEDGER_MIGRATION = "078_miles_lots.sql";

/** One change to the miles ledger, as posted by the Miles tab. Months are "YYYY-MM". */
export type MilesAction =
  | {
      action: "addLot";
      program: MilesProgram;
      amount: number;
      earnedMonth?: string | null;
      expiryMonth?: string | null;
      note?: string;
      clientRequestId?: string | null;
    }
  | { action: "setExpiryBucket"; expiryMonth: string; amount: number }
  | { action: "setUobBalance"; balance: number }
  | { action: "convert"; program: CardProgram; month: string; points: number; clientRequestId?: string | null }
  | { action: "redeem"; month: string; miles: number; description?: string; clientRequestId?: string | null }
  | { action: "undo"; activityId: string }
  | { action: "deleteLot"; lotId: string };

const UUID_RE = /^[0-9a-f-]{36}$/i;

function monthArg(v: unknown, required: true): string;
function monthArg(v: unknown, required: false): string | null;
function monthArg(v: unknown, required: boolean): string | null {
  if (v === undefined || v === null || v === "") {
    if (required) throw new Error("Pick a month");
    return null;
  }
  const m = typeof v === "string" ? monthFromYmd(v) : null;
  if (m === null) throw new Error("Pick a month");
  return monthToYmd(m);
}

function numberArg(v: unknown, min: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < min) {
    throw new Error(min > 0 ? "Enter a positive amount" : "Enter 0 or more points");
  }
  return Math.round(n);
}

function requestIdArg(v: unknown): string | null {
  const parsed = parseClientRequestId(v);
  if (parsed !== null && typeof parsed === "object") throw new Error(parsed.error);
  return parsed;
}

function idArg(v: unknown): string {
  if (typeof v !== "string" || !UUID_RE.test(v)) throw new Error("Entry not found");
  return v;
}

/**
 * Validates a posted action and runs it as one database transaction (078).
 * Throws with a user-facing message on bad input or a refused change.
 */
export async function applyMilesAction(
  supabase: SupabaseClient,
  userId: string,
  body: Record<string, unknown>
): Promise<unknown> {
  const call = (fn: string, args: Record<string, unknown>) =>
    callLedgerRpc<unknown>(supabase, fn, { p_user_id: userId, ...args }, MILES_LEDGER_MIGRATION);

  switch (body.action) {
    case "addLot": {
      if (!isMilesProgram(body.program)) throw new Error("Unknown programme");
      return call("miles_add_lot", {
        p_program: body.program,
        p_amount: numberArg(body.amount, 1),
        p_earned_month: monthArg(body.earnedMonth, false),
        p_expiry_month: monthArg(body.expiryMonth, false),
        p_note: typeof body.note === "string" ? body.note.slice(0, 200) : "",
        p_client_request_id: requestIdArg(body.clientRequestId),
      });
    }
    case "setExpiryBucket":
      return call("miles_set_expiry_bucket", {
        p_expiry_month: monthArg(body.expiryMonth, true),
        p_amount: numberArg(body.amount, 0),
      });
    case "setUobBalance":
      return call("miles_set_uob_balance", { p_balance: numberArg(body.balance, 0) });
    case "convert": {
      if (!isCardProgram(body.program)) throw new Error("Only card points can be converted");
      return call("miles_convert", {
        p_program: body.program,
        p_month: monthArg(body.month, true),
        p_points: numberArg(body.points, 1),
        p_client_request_id: requestIdArg(body.clientRequestId),
      });
    }
    case "redeem":
      return call("miles_redeem", {
        p_month: monthArg(body.month, true),
        p_miles: numberArg(body.miles, 1),
        p_description: typeof body.description === "string" ? body.description.slice(0, 200) : "",
        p_client_request_id: requestIdArg(body.clientRequestId),
      });
    case "undo":
      return call("miles_undo_activity", { p_activity_id: idArg(body.activityId) });
    case "deleteLot":
      return call("miles_delete_lot", { p_lot_id: idArg(body.lotId) });
    default:
      throw new Error("Invalid action");
  }
}
