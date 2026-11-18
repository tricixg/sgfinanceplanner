import { handleUnauthorized, isAppApiRequest } from "@/lib/auth/unauthorized";
import { noteResponse } from "@/lib/observability/client-request-ids";

/** Parse a fetch Response as JSON; avoid opaque "<!DOCTYPE" errors when the API returns HTML. */
export async function parseJsonResponse<T = unknown>(
  res: Response
): Promise<T> {
  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();

  if (!contentType.includes("application/json")) {
    const preview = text.trim().slice(0, 80);
    console.error("[fetch-json] expected JSON", {
      url: res.url,
      status: res.status,
      contentType,
      preview,
    });
    throw new Error(
      res.status === 404
        ? `API not found (${res.url}). Restart the dev server or redeploy.`
        : `Server returned ${res.status} (expected JSON, got HTML).`
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    console.error("[fetch-json] invalid JSON body", {
      url: res.url,
      status: res.status,
      preview: text.slice(0, 120),
    });
    throw new Error(`Invalid JSON from ${res.url}`);
  }
}

/** Default time a request may take, headers and body together, before we give up on it. */
export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

export const TIMEOUT_MESSAGE = "The server took too long — try again.";
export const OFFLINE_MESSAGE = "You're offline. Check your connection and try again.";
export const NETWORK_MESSAGE = "Couldn't reach the server. Check your connection and try again.";

export type FetchFailureKind = "timeout" | "offline" | "network";

/** A request that never produced a response. `message` is written for the user. */
export class FetchError extends Error {
  constructor(
    readonly kind: FetchFailureKind,
    message: string
  ) {
    super(message);
    this.name = "FetchError";
  }
}

export type FetchJsonInit = RequestInit & {
  /** Overrides DEFAULT_FETCH_TIMEOUT_MS for slow calls (imports, live quotes). 0 disables it. */
  timeoutMs?: number;
};

function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export async function fetchJson<T = unknown>(
  input: RequestInfo | URL,
  init?: FetchJsonInit
): Promise<{ res: Response; data: T }> {
  const { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, ...fetchInit } = init ?? {};
  if (isBrowserOffline()) throw new FetchError("offline", OFFLINE_MESSAGE);

  // One controller covers the whole call, so a server that sends headers and then stalls on the
  // body cannot hang us either. A caller's own signal still cancels the request.
  const controller = new AbortController();
  let timedOut = false;
  const callerSignal = fetchInit.signal;
  const onCallerAbort = () => controller.abort(callerSignal?.reason);
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort(callerSignal.reason);
    else callerSignal.addEventListener("abort", onCallerAbort, { once: true });
  }
  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : null;

  try {
    const res = await fetch(input, { ...fetchInit, signal: controller.signal });
    // The browser's session is no good (expired, revoked, forged cookie): go sign in again.
    if (res.status === 401 && isAppApiRequest(input)) handleUnauthorized();
    const data = await parseJsonResponse<T>(res);
    noteResponse(res, data);
    return { res, data };
  } catch (e) {
    if (timedOut) {
      console.error("[fetch-json] timed out", { url: String(input), timeoutMs });
      throw new FetchError("timeout", TIMEOUT_MESSAGE);
    }
    // The caller cancelled on purpose (unmount, newer request): let them see the abort.
    if (callerSignal?.aborted) throw e;
    if (e instanceof TypeError) {
      throw isBrowserOffline()
        ? new FetchError("offline", OFFLINE_MESSAGE)
        : new FetchError("network", NETWORK_MESSAGE);
    }
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
    callerSignal?.removeEventListener("abort", onCallerAbort);
  }
}
