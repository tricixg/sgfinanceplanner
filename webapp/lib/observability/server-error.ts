/**
 * Error tracking, option B (OPS-002): one JSON line per server error in the
 * Vercel function logs, easy to search and alert on (`"event":"server_error"`).
 * No external service.
 *
 * Privacy: only the scope, a scrubbed message, the error code/digest, the HTTP
 * method and the path WITHOUT its query string are logged. Request bodies,
 * headers and cookies are never included. Emails, ids, tokens and numbers
 * (amounts, balances) are replaced in the message and path.
 */

import { currentRequestId } from "@/lib/observability/request-context";
import { isValidRequestId } from "@/lib/observability/request-id";

export type ServerErrorEvent = {
  /** Where it happened, e.g. "api/expenses" or "next/route". */
  scope: string;
  message: string;
  /** Postgres / PostgREST error code, when there is one. */
  code?: string;
  /** Next.js error digest (Server Components). */
  digest?: string;
  method?: string;
  path?: string;
  routePath?: string;
  routeType?: string;
  /** The request this belongs to (OPS-002). Defaults to the request currently being handled. */
  requestId?: string;
};

const MAX_MESSAGE = 500;

/** Removes personal and financial values from free text before it is logged. */
export function scrubLogText(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, "[token]")
    .replace(/\b(?:bearer|token|apikey|api_key|password|secret)\b\s*[:=]?\s*\S+/gi, "[secret]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[id]")
    .replace(/-?\$?\d[\d,]*(?:\.\d+)?/g, "[n]")
    .slice(0, MAX_MESSAGE);
}

/** Path without the query string (it can carry dates, ids or tokens), ids scrubbed. */
export function scrubPath(path: string): string {
  const noQuery = path.split(/[?#]/, 1)[0] ?? "";
  return noQuery
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[id]")
    .slice(0, 200);
}

export function serverErrorLine(event: ServerErrorEvent, now: Date = new Date()): string {
  const line: Record<string, string> = {
    level: "error",
    event: "server_error",
    time: now.toISOString(),
    scope: event.scope.slice(0, 100),
    message: scrubLogText(event.message || "(no message)"),
  };
  if (event.code) line.code = String(event.code).slice(0, 20);
  if (event.digest) line.digest = String(event.digest).slice(0, 64);
  if (event.method) line.method = event.method.slice(0, 10);
  if (event.path) line.path = scrubPath(event.path);
  if (event.routePath) line.routePath = event.routePath.slice(0, 200);
  if (event.routeType) line.routeType = event.routeType.slice(0, 20);
  const requestId = event.requestId ?? currentRequestId();
  if (requestId && isValidRequestId(requestId)) line.requestId = requestId;
  const env = process.env.VERCEL_ENV;
  if (env) line.env = env;
  return JSON.stringify(line);
}

export function logServerError(event: ServerErrorEvent): void {
  console.error(serverErrorLine(event));
}

/** Message and code from anything thrown or returned as an error. */
export function errorParts(err: unknown): { message: string; code?: string; digest?: string } {
  if (typeof err === "string") return { message: err };
  if (err && typeof err === "object") {
    const o = err as { message?: unknown; code?: unknown; digest?: unknown };
    return {
      message: typeof o.message === "string" ? o.message : String(err),
      code: typeof o.code === "string" && o.code ? o.code : undefined,
      digest: typeof o.digest === "string" ? o.digest : undefined,
    };
  }
  return { message: String(err) };
}
