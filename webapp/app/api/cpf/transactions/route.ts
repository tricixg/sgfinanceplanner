import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { addCpfTransaction, listCpfTransactions } from "@/lib/cpf/transactions";
import type { AddCpfTransactionInput } from "@/lib/cpf/transactions";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, items: [] });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  try {
    const supabase = await createAuthedSupabaseClient();
    const items = await listCpfTransactions(supabase, auth.user.id);
    return NextResponse.json({ configured: true, items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load CPF transactions";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  let body: Partial<AddCpfTransactionInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const supabase = await createAuthedSupabaseClient();
    const result = await addCpfTransaction(supabase, auth.user.id, {
      txnDate: String(body.txnDate ?? ""),
      category: body.category as AddCpfTransactionInput["category"],
      amount: Number(body.amount ?? 0),
      fundingSource: body.fundingSource,
      btoStage: body.btoStage ?? null,
      note: body.note,
    });
    console.info("[api/cpf/transactions] POST ok", { userId: auth.user.id });
    return NextResponse.json({ item: result.transaction, oa: result.oa });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to log CPF transaction";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
