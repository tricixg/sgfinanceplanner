import type { Instrumentation } from "next";
import { errorParts, logServerError } from "@/lib/observability/server-error";

/**
 * Uncaught server errors (route handlers, Server Components, proxy) as one
 * scrubbed JSON log line each — see lib/observability/server-error.ts.
 * Request headers are deliberately not logged.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const { message, code, digest } = errorParts(err);
  logServerError({
    scope: `next/${context.routeType}`,
    message,
    code,
    digest,
    method: request.method,
    path: request.path,
    routePath: context.routePath,
    routeType: context.routeType,
  });
};
