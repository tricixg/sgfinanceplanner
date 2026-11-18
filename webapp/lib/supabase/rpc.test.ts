import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { callLedgerRpc, isMissingFunctionError, missingMigrationMessage, RpcError } from "@/lib/supabase/rpc";
import { isPublicMessage } from "@/lib/api/public-messages";

function client(result: { data?: unknown; error?: { message: string; code?: string } | null }) {
  return {
    rpc: async () => ({ data: result.data ?? null, error: result.error ?? null }),
  } as unknown as SupabaseClient;
}

describe("callLedgerRpc", () => {
  it("returns data", async () => {
    await expect(callLedgerRpc(client({ data: { a: 1 } }), "f", {}, "070_x.sql")).resolves.toEqual({ a: 1 });
  });

  it("passes function errors through with their code", async () => {
    const p = callLedgerRpc(client({ error: { message: "Insufficient balance", code: "P0001" } }), "f", {}, "070_x.sql");
    await expect(p).rejects.toBeInstanceOf(RpcError);
    await expect(p).rejects.toMatchObject({ message: "Insufficient balance", code: "P0001" });
  });

  it("turns a missing function into a clear, user-visible 'run migration' message", async () => {
    const p = callLedgerRpc(
      client({ error: { message: "Could not find the function public.f(a) in the schema cache", code: "PGRST202" } }),
      "f",
      {},
      "070_savings_ledger_functions.sql"
    );
    await expect(p).rejects.toThrow(missingMigrationMessage("070_savings_ledger_functions.sql"));
    expect(isPublicMessage(missingMigrationMessage("070_savings_ledger_functions.sql"))).toBe(true);
  });

  it("recognises missing-function errors", () => {
    expect(isMissingFunctionError({ code: "PGRST202" })).toBe(true);
    expect(isMissingFunctionError({ code: "42883" })).toBe(true);
    expect(isMissingFunctionError({ code: "P0001", message: "Insufficient balance" })).toBe(false);
    expect(isMissingFunctionError(null)).toBe(false);
  });
});
