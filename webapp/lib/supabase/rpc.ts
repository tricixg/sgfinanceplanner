import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Error from a database function, keeping the Postgres/PostgREST error code
 * (e.g. "23505" unique violation) so callers can map it like before.
 */
export class RpcError extends Error {
  readonly code: string | undefined;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "RpcError";
    this.code = code;
  }
}

/** User-facing text when the code is deployed before its migration was run. */
export function missingMigrationMessage(migration: string): string {
  return `The database is missing an update. Run migration ${migration} in the Supabase SQL editor, then try again.`;
}

/**
 * PostgREST reports an unknown function as PGRST202 ("Could not find the
 * function … in the schema cache"); a direct Postgres call reports 42883.
 */
export function isMissingFunctionError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "42883") return true;
  return /could not find the function/i.test(error.message ?? "");
}

/**
 * Calls a ledger database function. Errors raised inside the function
 * ("Insufficient balance", "Account not found", …) come back with the same
 * text the TypeScript code used to throw. A missing function becomes a clear
 * "run migration NNN" message instead of an obscure PostgREST error.
 */
export async function callLedgerRpc<T>(
  supabase: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
  migration: string
): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    if (isMissingFunctionError(error)) {
      console.error(`[rpc] ${fn} missing — run migration ${migration}`);
      throw new RpcError(missingMigrationMessage(migration), error.code);
    }
    throw new RpcError(error.message, error.code);
  }
  return data as T;
}
