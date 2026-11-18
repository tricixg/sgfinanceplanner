/**
 * Request IDs (OPS-002). One ID per request ties together what the user sees, the JSON error
 * body, and every log line in Vercel's function logs.
 *
 * The proxy assigns it: Vercel's own `x-vercel-id` when present (so it is the same string shown
 * in the Vercel dashboard), otherwise a generated one (local dev, tests). Anything the client sent
 * as `x-request-id` is ignored, so an ID in the logs is never attacker-chosen text.
 *
 * This file has no Node-only imports: the proxy uses it.
 */

export const REQUEST_ID_HEADER = "x-request-id";
export const VERCEL_ID_HEADER = "x-vercel-id";

/** Vercel IDs look like `hnd1::iad1::abcde-1700000000000-0123456789ab`. */
const VALID_ID = /^[A-Za-z0-9:._-]{8,128}$/;

export function isValidRequestId(id: unknown): id is string {
  return typeof id === "string" && VALID_ID.test(id);
}

type HeaderReader = { get(name: string): string | null };

function generateId(): string {
  return `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

/** The ID the proxy stamps on a request: `x-vercel-id` if it is well-formed, else a new one. */
export function assignRequestId(incoming: HeaderReader): string {
  const vercel = incoming.get(VERCEL_ID_HEADER);
  return isValidRequestId(vercel) ? vercel : generateId();
}

/** The ID a route handler uses: the one the proxy stamped, else x-vercel-id, else a new one. */
export function requestIdFromHeaders(headers: HeaderReader | undefined): string {
  const stamped = headers?.get(REQUEST_ID_HEADER) ?? null;
  if (isValidRequestId(stamped)) return stamped;
  return headers ? assignRequestId(headers) : generateId();
}
