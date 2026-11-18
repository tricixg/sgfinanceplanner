import type { Instrumentation } from "next";
import { errorParts, logServerError } from "@/lib/observability/server-error";
import { REQUEST_ID_HEADER, isValidRequestId } from "@/lib/observability/request-id";

/**
 * Runs once per server instance. Installs the hook that stamps the request ID into
 * `[scope]`-prefixed log lines written while a route handler runs (OPS-002).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installRequestIdLogging } = await import("@/lib/observability/console-request-id");
    installRequestIdLogging();
  }
}

/**
 * Uncaught server errors (route handlers, Server Components, proxy) as one
 * scrubbed JSON line each — see lib/observability/server-error.ts.
 * Request headers are deliberately not logged; the only header read is the request ID
 * the proxy stamped, so the line can be matched to what the user saw.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const { message, code, digest } = errorParts(err);
  const raw = request.headers[REQUEST_ID_HEADER];
  const stamped = Array.isArray(raw) ? raw[0] : raw;
  logServerError({
    scope: `next/${context.routeType}`,
    message,
    code,
    digest,
    method: request.method,
    path: request.path,
    routePath: context.routePath,
    routeType: context.routeType,
    requestId: isValidRequestId(stamped) ? stamped : undefined,
  });
};
