const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 40;

const buckets = new Map<number, { count: number; resetAt: number }>();

/** Best-effort per-chat limit (per serverless instance). */
export function isRateLimited(chatId: number): boolean {
  const now = Date.now();
  const entry = buckets.get(chatId);
  if (!entry || now > entry.resetAt) {
    buckets.set(chatId, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  if (entry.count > MAX_PER_WINDOW) {
    console.info("[telegram] rate limited", { chatId, count: entry.count });
    return true;
  }
  return false;
}
