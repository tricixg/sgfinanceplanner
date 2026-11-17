/** An error a save path wants surfaced to the client with a specific HTTP status. */
export class SaveError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "SaveError";
  }
}

export function saveErrorStatus(e: unknown): number {
  return e instanceof SaveError ? e.status : 500;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for ids that came from the database (client-made ids like `new-pool-0` are not). */
export function isPersistedId(id: unknown): id is string {
  return typeof id === "string" && UUID_RE.test(id);
}

/** Sanitise a client-supplied `deletedIds` list: strings only, deduplicated. */
export function cleanIdList(ids: unknown, accept: (id: string) => boolean = isPersistedId): string[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((x): x is string => typeof x === "string" && accept(x)))];
}
