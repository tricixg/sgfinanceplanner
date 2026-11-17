import { timingSafeEqual } from "node:crypto";

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when the CRON_SECRET
 * env var is set. Fails closed: no secret configured → nothing is authorised.
 */
export function verifyCronSecret(
  req: Request,
  secret: string | undefined = process.env.CRON_SECRET
): "ok" | "unconfigured" | "unauthorized" {
  const expected = secret?.trim();
  if (!expected) return "unconfigured";
  const header = req.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return "unauthorized";
  return timingSafeEqual(a, b) ? "ok" : "unauthorized";
}
