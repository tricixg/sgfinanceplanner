import type { SupabaseClient } from "@supabase/supabase-js";
import { getLinkByChatId } from "@/lib/telegram/links";

export class TelegramScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramScopeError";
  }
}

/**
 * Ensures all Telegram bot writes use the user_id bound to this chat_id in telegram_links.
 * Call before any service-role DB write keyed by userId.
 */
export async function assertTelegramWriteScope(
  supabase: SupabaseClient,
  telegramChatId: number,
  userId: string
): Promise<void> {
  const link = await getLinkByChatId(supabase, telegramChatId);
  if (!link) {
    console.error("[telegram] write blocked — chat not linked", { telegramChatId });
    throw new TelegramScopeError("Chat not linked");
  }
  if (link.userId !== userId) {
    console.error("[telegram] write blocked — userId does not match link", {
      telegramChatId,
      requestedUserId: userId,
      linkedUserId: link.userId,
    });
    throw new TelegramScopeError("User scope mismatch");
  }
}

export async function getLinkedUserIdForChat(
  supabase: SupabaseClient,
  telegramChatId: number
): Promise<string | null> {
  const link = await getLinkByChatId(supabase, telegramChatId);
  return link?.userId ?? null;
}
