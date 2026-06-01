import type { SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";

const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type TelegramLink = {
  userId: string;
  telegramUserId: number;
  telegramChatId: number;
  username: string | null;
  linkedAt: string;
};

function generateCode(): string {
  const bytes = randomBytes(6);
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += CODE_CHARS[bytes[i]! % CODE_CHARS.length];
  }
  return out;
}

export async function createLinkCode(
  supabase: SupabaseClient,
  userId: string
): Promise<{ code: string; expiresAt: string }> {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

  const { error } = await supabase.from("telegram_link_codes").insert({
    code,
    user_id: userId,
    expires_at: expiresAt,
  });

  if (error) {
    console.error("[telegram] createLinkCode failed", error.message);
    throw new Error(error.message);
  }

  console.info("[telegram] link code created", { userId, code });
  return { code, expiresAt };
}

export async function consumeLinkCode(
  supabase: SupabaseClient,
  code: string,
  telegramUserId: number,
  telegramChatId: number,
  username: string | null
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) {
    return { ok: false, error: "Invalid link code" };
  }

  const { data: row, error } = await supabase
    .from("telegram_link_codes")
    .select("*")
    .eq("code", normalized)
    .maybeSingle();

  if (error) {
    console.error("[telegram] consumeLinkCode lookup failed", error.message);
    return { ok: false, error: error.message };
  }
  if (!row) {
    return { ok: false, error: "Code not found or expired" };
  }
  if (row.used_at) {
    return { ok: false, error: "Code already used" };
  }
  if (new Date(String(row.expires_at)).getTime() < Date.now()) {
    return { ok: false, error: "Code expired — generate a new one in the app" };
  }

  const userId = String(row.user_id);

  const { error: markErr } = await supabase
    .from("telegram_link_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("code", normalized);

  if (markErr) {
    return { ok: false, error: markErr.message };
  }

  await supabase.from("telegram_links").delete().eq("telegram_user_id", telegramUserId);
  await supabase.from("telegram_links").delete().eq("telegram_chat_id", telegramChatId);
  await supabase.from("telegram_links").delete().eq("user_id", userId);

  const { error: insErr } = await supabase.from("telegram_links").insert({
    user_id: userId,
    telegram_user_id: telegramUserId,
    telegram_chat_id: telegramChatId,
    username,
  });

  if (insErr) {
    console.error("[telegram] link insert failed", insErr.message);
    return { ok: false, error: insErr.message };
  }

  console.info("[telegram] account linked", {
    userId,
    telegramUserId,
    telegramChatId,
    username,
  });
  return { ok: true, userId };
}

export async function getLinkByChatId(
  supabase: SupabaseClient,
  chatId: number
): Promise<TelegramLink | null> {
  const { data, error } = await supabase
    .from("telegram_links")
    .select("*")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();

  if (error) {
    console.error("[telegram] getLinkByChatId failed", error.message);
    return null;
  }
  if (!data) return null;

  return {
    userId: String(data.user_id),
    telegramUserId: Number(data.telegram_user_id),
    telegramChatId: Number(data.telegram_chat_id),
    username: data.username ? String(data.username) : null,
    linkedAt: String(data.linked_at),
  };
}

export async function getLinkByUserId(
  supabase: SupabaseClient,
  userId: string
): Promise<TelegramLink | null> {
  const { data, error } = await supabase
    .from("telegram_links")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[telegram] getLinkByUserId failed", error.message);
    return null;
  }
  if (!data) return null;

  return {
    userId: String(data.user_id),
    telegramUserId: Number(data.telegram_user_id),
    telegramChatId: Number(data.telegram_chat_id),
    username: data.username ? String(data.username) : null,
    linkedAt: String(data.linked_at),
  };
}

export async function deleteLinkByUserId(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { error } = await supabase.from("telegram_links").delete().eq("user_id", userId);
  if (error) {
    console.error("[telegram] deleteLinkByUserId failed", error.message);
    throw new Error(error.message);
  }
  console.info("[telegram] link removed", { userId });
}
