import { apiError } from "@/lib/api/api-error";
import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { addCpfTransaction, listCpfTransactions } from "@/lib/cpf/transactions";
import { parseClientRequestId } from "@/lib/api/idempotency";
import type { AddCpfTransactionInput } from "@/lib/cpf/transactions";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { withRequestId } from "@/lib/api/with-request-id";

export const GET = withRequestId(async function GET() {
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
    return apiError("api/cpf/transactions", msg, { fallback: "Failed to load CPF transactions" });
  }
});

export const POST = withRequestId(async function POST(req: NextRequest) {
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

  const clientRequestId = parseClientRequestId(body.clientRequestId);
  if (clientRequestId && typeof clientRequestId === "object") {
    return NextResponse.json({ error: clientRequestId.error }, { status: 400 });
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
      clientRequestId,
    });
    console.info("[api/cpf/transactions] POST ok", { userId: auth.user.id });
    return NextResponse.json({ item: result.transaction, oa: result.oa });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to log CPF transaction";
    return apiError("api/cpf/transactions", msg, { status: 400, fallback: "Failed to log CPF transaction" });
  }
});
