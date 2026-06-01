## Client data and cross-page refresh

- **Session cache (`AppDataContext`):** profile, loans, budget, cards, holdings — load once per sign-in; persist via `save*` methods on the context. Use targeted reloads (`reloadLoans`, `reloadSnapshots`) instead of full `reload()` when only one domain changed.
- **Per-tab fetch:** expenses, recurring, transactions, travel, poker — fetch in the tab; refresh via `useDomainEvent` when related domains change.
- **After every mutation:** call `dispatchDomainEvent(...)` from [`lib/events/domain-events.ts`](lib/events/domain-events.ts) with the affected domain(s). Subscribe with [`hooks/useDomainEvent.ts`](hooks/useDomainEvent.ts).
- **Logging:** prefer `console.info` / `console.error` with a `[Component]` or `[api/feature]` prefix; avoid noisy `console.log` in production UI paths.
- **Large tabs:** credit card UI lives under [`components/credit-cards/`](components/credit-cards/); `TabCards.tsx` composes those pieces only.
- **Page errors:** [`PageErrorBoundary`](components/app/PageErrorBoundary.tsx) wraps main content in `AppShell`; [`app/(app)/error.tsx`](app/(app)/error.tsx) handles segment failures. Prefer extending `PageErrorFallback` for shared copy/actions.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
