import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { getBotUsername } from "@/lib/telegram/bot-info";
import {
  createLinkCode,
  deleteLinkByUserId,
  getLinkByUserId,
} from "@/lib/telegram/links";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { isTelegramConfigured } from "@/lib/telegram/config";

export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, linked: false });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const supabase = await createAuthedSupabaseClient();
  const link = await getLinkByUserId(supabase, auth.user.id);

  return NextResponse.json({
    configured: true,
    telegramConfigured: isTelegramConfigured(),
    linked: Boolean(link),
    username: link?.username ?? null,
    linkedAt: link?.linkedAt ?? null,
  });
}

export async function POST() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }
  if (!isTelegramConfigured()) {
    return NextResponse.json({ error: "Telegram bot not configured on server" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const supabase = await createAuthedSupabaseClient();
  const { code, expiresAt } = await createLinkCode(supabase, auth.user.id);
  const botUsername = await getBotUsername();

  console.info("[api/telegram/link] code issued", { userId: auth.user.id });

  return NextResponse.json({
    code,
    expiresAt,
    botUsername,
  });
}

export async function DELETE() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const supabase = await createAuthedSupabaseClient();
  await deleteLinkByUserId(supabase, auth.user.id);

  return NextResponse.json({ ok: true });
}
