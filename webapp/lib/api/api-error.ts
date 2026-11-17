import { NextResponse } from "next/server";
import { isPublicMessage } from "@/lib/api/public-messages";

export const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

function rawMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "";
}

/**
 * The message safe to send to the browser, logging the real one server-side when it is not.
 * Deliberate user-facing messages (see `public-messages.ts`) pass through; anything else —
 * Postgres/PostgREST text, stack-ish internals — is replaced by `fallback`.
 */
export function publicErrorMessage(
  scope: string,
  err: unknown,
  fallback: string = GENERIC_ERROR_MESSAGE
): string {
  const raw = rawMessage(err);
  if (raw && isPublicMessage(raw)) return raw;
  console.error(`[${scope}] internal error`, raw || err);
  return fallback;
}

/**
 * JSON error response that never leaks database/internal error text.
 * Logs the real error server-side; returns a generic message (or `fallback`) with `status`,
 * unless the error is one of the app's deliberate messages.
 */
export function apiError(
  scope: string,
  err: unknown,
  opts: { status?: number; fallback?: string } = {}
): NextResponse {
  return NextResponse.json(
    { error: publicErrorMessage(scope, err, opts.fallback) },
    { status: opts.status ?? 500 }
  );
}
