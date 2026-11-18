import { REQUEST_ID_HEADER, isValidRequestId } from "@/lib/observability/request-id";

/**
 * Browser-side memory of which request an error message came from (OPS-002), so the message on
 * screen can show a small reference the user can quote and I can search for in the Vercel logs.
 *
 * Callers throw their own Error from `data.error`, so the ID cannot travel with the exception.
 * Instead fetchJson notes every failed response here, and the places that display an error look
 * it up: by the message text (the server's own error string appears verbatim in what is shown),
 * or by a named channel for messages the client wrote itself (e.g. "domain:cards").
 * Requests that never got a response (timeout, offline) have no ID and show none.
 */
type Entry = { text?: string; channel?: string; requestId: string; at: number };

const MAX_ENTRIES = 50;
const MAX_AGE_MS = 10 * 60 * 1000;
let entries: Entry[] = [];

export function rememberFailure(entry: { text?: string; channel?: string; requestId: unknown }): void {
  if (!isValidRequestId(entry.requestId)) return;
  const text = entry.text?.trim();
  if (!text && !entry.channel) return;
  entries = [
    { text, channel: entry.channel, requestId: entry.requestId, at: Date.now() },
    ...entries,
  ].slice(0, MAX_ENTRIES);
}

function fresh(): Entry[] {
  const cutoff = Date.now() - MAX_AGE_MS;
  return entries.filter((e) => e.at >= cutoff);
}

/** The most recent failed request whose server error text appears in `message`. */
export function requestIdForMessage(message: string | null | undefined): string | null {
  if (!message) return null;
  return fresh().find((e) => e.text && message.includes(e.text))?.requestId ?? null;
}

/** The most recent failed request noted under this channel. */
export function requestIdForChannel(channel: string): string | null {
  return fresh().find((e) => e.channel === channel)?.requestId ?? null;
}

/** Called by fetchJson for every response; only failed ones are remembered. */
export function noteResponse(res: Response, data: unknown): void {
  if (res.ok) return;
  const body = data && typeof data === "object" ? (data as { error?: unknown; requestId?: unknown }) : {};
  const requestId = body.requestId ?? res.headers?.get?.(REQUEST_ID_HEADER);
  if (typeof body.error === "string") rememberFailure({ text: body.error, requestId });
}

/** Test hook. */
export function resetRequestIdsForTests(): void {
  entries = [];
}
