/** Typed cross-page mutation signals (browser CustomEvents). */

export type DomainEventName =
  | "expense:changed"
  | "recurring:changed"
  | "savings:changed"
  | "accounts:changed"
  | "funds:changed"
  | "miles:changed"
  | "loans:changed"
  | "otherLoans:changed"
  | "budget:changed"
  | "cards:changed"
  | "holdings:changed"
  | "profile:changed";

export function dispatchDomainEvent(name: DomainEventName | DomainEventName[]): void {
  if (typeof window === "undefined") return;
  const names = Array.isArray(name) ? name : [name];
  for (const eventName of names) {
    window.dispatchEvent(new CustomEvent(eventName));
    console.info("[domain-events] dispatched", eventName);
  }
}

/** Subscribe outside React (e.g. tests). Returns unsubscribe. */
export function subscribeDomainEvent(
  name: DomainEventName | DomainEventName[],
  handler: () => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const names = Array.isArray(name) ? name : [name];
  const wrapped = () => handler();
  for (const eventName of names) {
    window.addEventListener(eventName, wrapped);
  }
  return () => {
    for (const eventName of names) {
      window.removeEventListener(eventName, wrapped);
    }
  };
}
