import { currentRequestId } from "@/lib/observability/request-context";

/**
 * Stamps the request ID into every bracket-scoped log line written while a route handler runs:
 * `[api/state] GET ok` becomes `[api/state] [req hnd1::iad1::abc-123] GET ok`. Lines that are
 * not strings starting with `[` (the JSON error lines, third-party output) are left alone; the
 * JSON lines carry `requestId` themselves.
 */
const INSTALLED = Symbol.for("sgfinanceplanner.requestIdLogging");
const METHODS = ["log", "info", "warn", "error"] as const;

export function stampRequestId(args: unknown[], requestId: string | undefined): unknown[] {
  const first = args[0];
  if (!requestId || typeof first !== "string" || !first.startsWith("[")) return args;
  return [first.replace(/^(\[[^\]]*\])/, `$1 [req ${requestId}]`), ...args.slice(1)];
}

export function installRequestIdLogging(target: Console = console): void {
  const t = target as Console & { [INSTALLED]?: boolean };
  if (t[INSTALLED]) return;
  t[INSTALLED] = true;
  for (const m of METHODS) {
    const original = t[m].bind(t);
    t[m] = (...args: unknown[]) => original(...stampRequestId(args, currentRequestId()));
  }
}
