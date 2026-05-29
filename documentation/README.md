# SG Finance Planner — Technical Documentation

Technical reference for the **webapp** (`webapp/`): architecture, routes, features, database schema, and data flows. All paths in this doc set are relative to the repository root unless noted.

## Start here

| If you are… | Read |
|-------------|------|
| **New to the codebase** | [01-overview.md](./01-overview.md) → [02-architecture.md](./02-architecture.md) → [09-development-guide.md](./09-development-guide.md) |
| **Calling or extending APIs** | [03-routes-and-api.md](./03-routes-and-api.md) |
| **Working on a product area** | [04-features.md](./04-features.md) |
| **Database / migrations / RLS** | [05-database-schema.md](./05-database-schema.md) |
| **Expenses, ledgers, transaction history** | [06-ledgers-and-transactions.md](./06-ledgers-and-transactions.md) |
| **Credit cards & statements** | [07-credit-cards-and-statements.md](./07-credit-cards-and-statements.md) |
| **Auth & security** | [08-authentication-and-security.md](./08-authentication-and-security.md) |

## Contents

| Doc | Summary |
|-----|---------|
| [01-overview.md](./01-overview.md) | Product scope, tech stack, repo layout, runtime modes |
| [02-architecture.md](./02-architecture.md) | Layers, providers, state model, request flow diagrams |
| [03-routes-and-api.md](./03-routes-and-api.md) | All page routes and API endpoints |
| [04-features.md](./04-features.md) | Features by navigation area (UI, API, lib, tables) |
| [05-database-schema.md](./05-database-schema.md) | Migrations 001–025, tables, FKs, RLS, ER diagram |
| [06-ledgers-and-transactions.md](./06-ledgers-and-transactions.md) | `expenses`, `savings_transactions`, `budget_transactions`, unified list |
| [07-credit-cards-and-statements.md](./07-credit-cards-and-statements.md) | Cards, billing cycles, tracked spend, payments |
| [08-authentication-and-security.md](./08-authentication-and-security.md) | Magic link, middleware, RLS, env vars |
| [09-development-guide.md](./09-development-guide.md) | Setup, scripts, conventions, adding features |

## Related

- User setup: [webapp/README.md](../webapp/README.md)
- SQL migrations: [webapp/supabase/migrations/](../webapp/supabase/migrations/)
- Navigation config: [webapp/lib/nav-config.ts](../webapp/lib/nav-config.ts)
