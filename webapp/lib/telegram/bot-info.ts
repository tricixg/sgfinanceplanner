import { getTelegramBotToken } from "@/lib/telegram/config";

let cachedUsername: string | null = null;

export async function getBotUsername(): Promise<string | null> {
  if (cachedUsername) return cachedUsername;
  const token = getTelegramBotToken();
  if (!token) return null;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = (await res.json()) as { ok?: boolean; result?: { username?: string } };
    if (data.ok && data.result?.username) {
      cachedUsername = data.result.username;
      return cachedUsername;
    }
  } catch (e) {
    console.error("[telegram] getMe failed", e);
  }
  return null;
}
