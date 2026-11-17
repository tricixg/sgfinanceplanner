## Client data and cross-page refresh

- **Session cache (`AppDataContext`):** profile, loans, budget, cards, holdings — load once per sign-in; persist via `save*` methods on the context. Use targeted reloads (`reloadLoans`, `reloadSnapshots`) instead of full `reload()` when only one domain changed.
- **Per-tab fetch:** expenses, recurring, transactions, travel, poker — fetch in the tab; refresh via `useDomainEvent` when related domains change.
- **After every mutation:** call `dispatchDomainEvent(...)` from [`lib/events/domain-events.ts`](lib/events/domain-events.ts) with the affected domain(s). Subscribe with [`hooks/useDomainEvent.ts`](hooks/useDomainEvent.ts).
- **Logging:** prefer `console.info` / `console.error` with a `[Component]` or `[api/feature]` prefix; avoid noisy `console.log` in production UI paths.
- **Large tabs:** credit card UI lives under [`components/credit-cards/`](components/credit-cards/); `TabCards.tsx` composes those pieces only.
- **Page errors:** [`PageErrorBoundary`](components/app/PageErrorBoundary.tsx) wraps main content in `AppShell`; [`app/(app)/error.tsx`](app/(app)/error.tsx) handles segment failures. Prefer extending `PageErrorFallback` for shared copy/actions.
- **Row limits:** PostgREST silently truncates any response at 1,000 rows. Any query that feeds a sum, analytic or index must page with [`fetchAllRows`](lib/supabase/fetch-all.ts) (deterministic `order` by date then `id`), not a bare `.select()`.
- **Telegram bot:** webhook [`app/api/telegram/webhook/route.ts`](app/api/telegram/webhook/route.ts); logic in [`lib/telegram/`](lib/telegram/); link UI on Me tab. Uses service role + `telegram_links` user mapping.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
