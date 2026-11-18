import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Wraps a (fake) Supabase client so every query/rpc takes `ms` to answer, and records when
 * each one started and finished. `depth()` is the length of the longest chain of calls where
 * each started after the previous one finished — i.e. the number of dependent round-trips,
 * independent of how long the calls take. Used to pin "at most N sequential DB calls".
 */
export function withLatency(client: SupabaseClient, ms = 15) {
  const calls: { start: number; end: number }[] = [];
  let clock = 0;

  const timed = <T>(run: () => PromiseLike<T>): Promise<T> => {
    const call = { start: ++clock, end: 0 };
    calls.push(call);
    return new Promise<T>((resolve, reject) => {
      setTimeout(() => {
        Promise.resolve(run()).then(
          (v) => {
            call.end = ++clock;
            resolve(v);
          },
          (e) => {
            call.end = ++clock;
            reject(e);
          }
        );
      }, ms);
    });
  };

  const wrapBuilder = (builder: Record<string, unknown>): Record<string, unknown> => {
    const proxy: Record<string, unknown> = new Proxy(builder, {
      get(target, prop) {
        if (prop === "then") {
          return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            timed(
              () =>
                new Promise((resolve, reject) =>
                  (target.then as (a: unknown, b: unknown) => unknown)(resolve, reject)
                )
            ).then(res, rej);
        }
        const v = target[prop as string];
        if (typeof v !== "function") return v;
        return (...args: unknown[]) => {
          const out = (v as (...a: unknown[]) => unknown).apply(target, args);
          return out === target ? proxy : out;
        };
      },
    });
    return proxy;
  };

  const wrapped = {
    from: (t: string) =>
      wrapBuilder((client as unknown as { from: (t: string) => Record<string, unknown> }).from(t)),
    rpc: (name: string, args?: unknown) =>
      timed(() => (client as unknown as { rpc: (n: string, a?: unknown) => PromiseLike<unknown> }).rpc(name, args)),
  } as unknown as SupabaseClient;

  return {
    client: wrapped,
    calls,
    depth() {
      const done = calls.filter((c) => c.end > 0).sort((a, b) => a.start - b.start);
      // Longest chain: dp over calls ordered by start.
      const best: number[] = [];
      let max = 0;
      for (let i = 0; i < done.length; i++) {
        best[i] = 1;
        for (let j = 0; j < i; j++) {
          if (done[j].end < done[i].start) best[i] = Math.max(best[i], best[j] + 1);
        }
        max = Math.max(max, best[i]);
      }
      return max;
    },
  };
}
