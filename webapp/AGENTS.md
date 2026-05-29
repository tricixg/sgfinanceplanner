## Client data and cross-page refresh

- **Session cache (`AppDataContext`):** profile, loans, budget, cards, holdings — load once per sign-in; persist via `save*` methods on the context.
- **Per-tab fetch:** expenses, recurring, transactions, travel, poker — fetch in the tab; refresh via `useDomainEvent` when related domains change.
- **After every mutation:** call `dispatchDomainEvent(...)` from [`lib/events/domain-events.ts`](lib/events/domain-events.ts) with the affected domain(s). Subscribe with [`hooks/useDomainEvent.ts`](hooks/useDomainEvent.ts).

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
