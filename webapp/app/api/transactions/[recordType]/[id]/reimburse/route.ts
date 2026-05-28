import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import {
  normalizeRecordType,
  reimburseTransactionWithLedger,
} from "@/lib/transactions/actions";

type Params = { params: Promise<{ recordType: string; id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const { recordType: rawType, id } = await params;
  const recordType = normalizeRecordType(rawType);
  if (!recordType) {
    return NextResponse.json({ error: "Invalid record type" }, { status: 400 });
  }

  let body: { amount?: number; financialAccountId?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const amount = Number(body.amount ?? 0);
  if (!(amount > 0)) {
    return NextResponse.json({ error: "Valid amount required" }, { status: 400 });
  }

  const supabase = await createAuthedSupabaseClient();
  try {
    const result = await reimburseTransactionWithLedger(supabase, user.id, {
      recordType,
      id,
      amount,
      financialAccountId: body.financialAccountId,
      note: body.note,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Reimburse failed";
    const status = msg === "Not found" ? 404 : 500;
    console.error("[transactions-action] reimburse failed", {
      recordType,
      id,
      msg,
    });
    return NextResponse.json({ error: msg }, { status });
  }
}
