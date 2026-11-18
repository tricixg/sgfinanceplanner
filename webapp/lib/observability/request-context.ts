import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The current request's ID, available to anything running inside a route handler (the error
 * helper, the logger) without passing it around. Server only.
 *
 * The store lives on globalThis because Next bundles instrumentation and each route separately:
 * module-level state would be a different instance in each, and the console hook installed from
 * instrumentation could not see the context a route handler set.
 */
export type RequestContext = { requestId: string };

const KEY = Symbol.for("sgfinanceplanner.requestContext");
type G = typeof globalThis & { [KEY]?: AsyncLocalStorage<RequestContext> };

function store(): AsyncLocalStorage<RequestContext> {
  const g = globalThis as G;
  return (g[KEY] ??= new AsyncLocalStorage<RequestContext>());
}

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return store().run(ctx, fn);
}

/** The request ID of the handler currently running, or undefined outside a request. */
export function currentRequestId(): string | undefined {
  return store().getStore()?.requestId;
}
