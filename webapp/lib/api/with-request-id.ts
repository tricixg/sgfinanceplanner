import { REQUEST_ID_HEADER, requestIdFromHeaders } from "@/lib/observability/request-id";
import { runWithRequestContext } from "@/lib/observability/request-context";

type Handler = (...args: never[]) => Response | Promise<Response>;

/**
 * Wraps a route handler so that, for the whole request:
 *  - the request ID (stamped by the proxy) is available to `currentRequestId()`, which the error
 *    helper and the log hook read;
 *  - every response carries it in the `x-request-id` header;
 *  - every JSON error body (status >= 400, `{ error }`) also carries `requestId`, however the
 *    handler built it, so the message a user sees can be matched to the Vercel logs.
 */
export function withRequestId<H extends Handler>(handler: H): H {
  const wrapped = async (...args: unknown[]) => {
    const req = args[0] as { headers?: Headers } | undefined;
    const requestId = requestIdFromHeaders(req?.headers);
    return runWithRequestContext({ requestId }, async () => {
      const res = await (handler as unknown as (...a: unknown[]) => Response | Promise<Response>)(...args);
      return decorate(res, requestId);
    });
  };
  return wrapped as unknown as H;
}

async function decorate(res: Response, requestId: string): Promise<Response> {
  if (!res || typeof res.headers?.set !== "function") return res;
  const isJsonError =
    res.status >= 400 && (res.headers.get("content-type") ?? "").includes("application/json");
  if (isJsonError) {
    try {
      const body: unknown = await res.clone().json();
      if (
        body && typeof body === "object" && !Array.isArray(body) &&
        typeof (body as { error?: unknown }).error === "string" &&
        !("requestId" in body)
      ) {
        const headers = new Headers(res.headers);
        headers.delete("content-length");
        headers.set(REQUEST_ID_HEADER, requestId);
        return new Response(JSON.stringify({ ...body, requestId }), {
          status: res.status,
          statusText: res.statusText,
          headers,
        });
      }
    } catch {
      // Not parseable JSON after all: leave the body alone and fall through to the header.
    }
  }
  try {
    res.headers.set(REQUEST_ID_HEADER, requestId);
  } catch {
    // Immutable headers (a redirect to an external response, say): skip rather than fail the request.
  }
  return res;
}
