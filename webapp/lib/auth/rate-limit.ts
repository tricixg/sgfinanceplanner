/**
 * In-memory per-user rate limiter for API routes.
 * Note: on Vercel each serverless instance has its own map — limits are per-instance, not global.
 */

type Bucket = { count: number; windowStartMs: number };

const buckets = new Map<string, Bucket>();

export type RateLimitOptions = {
  /** Max requests allowed per window */
  limit: number;
  /** Window size in milliseconds */
  windowMs: number;
};

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSec: number };

export function checkRateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStartMs >= windowMs) {
    buckets.set(key, { count: 1, windowStartMs: now });
    return { allowed: true };
  }

  if (bucket.count < limit) {
    bucket.count += 1;
    return { allowed: true };
  }

  const retryAfterMs = windowMs - (now - bucket.windowStartMs);
  const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
  console.info("[rate-limit] denied", { key, limit, windowMs, retryAfterSec });
  return { allowed: false, retryAfterSec };
}

/** Test helper — reset all buckets */
export function resetRateLimitsForTests(): void {
  buckets.clear();
}
