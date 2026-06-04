export function getTelegramBotToken(): string | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return token || null;
}

export function getTelegramWebhookSecret(): string | null {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  return secret || null;
}

export function isTelegramConfigured(): boolean {
  return Boolean(getTelegramBotToken() && getTelegramWebhookSecret());
}

export function verifyTelegramWebhookSecret(req: Request): boolean {
  const secret = getTelegramWebhookSecret();
  if (!secret) return false;
  return req.headers.get("x-telegram-bot-api-secret-token") === secret;
}
