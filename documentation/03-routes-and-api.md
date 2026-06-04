# 03 — Routes and API

All routes live under [webapp/app/](../webapp/app/). Unless noted, API routes require a valid Supabase session (`requireSessionUser`).

## Page routes (UI)

Root redirect: `/` → `/this-month` ([webapp/app/page.tsx](../webapp/app/page.tsx)).

| Path | Page file | Route wrapper | Tab / component |
|------|-----------|---------------|-----------------|
| `/login` | `app/login/page.tsx` | — | Magic link sign-in |
| `/this-month` | `app/(app)/this-month/page.tsx` | `ThisMonthRoute` | `TabThisMonth` |
| `/this-month-cashflow` | `app/(app)/this-month-cashflow/page.tsx` | `ThisMonthCashflowRoute` | `TabThisMonthCashflow` |
| `/budget` | `app/(app)/budget/page.tsx` | `BudgetRoute` | `TabBudgetSavings` |
| `/savings` | `app/(app)/savings/page.tsx` | `SavingsRoute` | `TabSavings` |
| `/now` | `app/(app)/now/page.tsx` | `NowRoute` | `TabNow` |
| `/year` | `app/(app)/year/page.tsx` | `YearRoute` | `TabYear` |
| `/bto` | `app/(app)/bto/page.tsx` | `BtoRoute` | `TabBTO` |
| `/expenses` | `app/(app)/expenses/page.tsx` | `ExpensesRoute` | `TabExpenses` |
| `/recurring` | `app/(app)/recurring/page.tsx` | `RecurringRoute` | `TabRecurring` |
| `/transactions` | `app/(app)/transactions/page.tsx` | `TransactionsRoute` | `TransactionsHistoryPage` |
| `/travel` | `app/(app)/travel/page.tsx` | `TravelRoute` | `TabTravel` |
| `/travel/[id]` | `app/(app)/travel/[id]/page.tsx` | `TravelTripRoute` | `TabTravelTrip` |
| `/poker` | `app/(app)/poker/page.tsx` | `PokerRoute` | `TabPoker` |
| `/poker/stats` | `app/(app)/poker/stats/page.tsx` | `PokerStatsRoute` | `PokerStatsPage` |
| `/cash-accounts` | `app/(app)/cash-accounts/page.tsx` | `CashAccountsRoute` | `TabCashAccounts` |
| `/cards` | `app/(app)/cards/page.tsx` | `CardsRoute` | `TabCards` |
| `/wealth` | `app/(app)/wealth/page.tsx` | `WealthRoute` | `TabWealth` |
| `/cpf` | `app/(app)/cpf/page.tsx` | `CpfRoute` | `TabCPF` |
| `/debt` | `app/(app)/debt/page.tsx` | `DebtRoute` | `TabDebt` |
| `/me` | `app/(app)/me/page.tsx` | `MeRoute` | `TabMe` |

Route wrappers: [webapp/components/app/pages/](../webapp/components/app/pages/).  
Auth callback (not a page): `GET /auth/callback` — [webapp/app/auth/callback/route.ts](../webapp/app/auth/callback/route.ts).

---

## API routes

Convention: JSON body/response; errors `{ error: string }`; many list endpoints include `configured: boolean`.

### Auth

| Method | Path | Handler | Auth | Notes |
|--------|------|---------|------|-------|
| GET | `/api/auth/session` | `app/api/auth/session/route.ts` | Optional | Current user; dev bypass |
| POST | `/api/auth/signout` | `app/api/auth/signout/route.ts` | Session | Clears cookies |

### State, summary, profile

| Method | Path | Handler | Primary lib |
|--------|------|---------|-------------|
| GET | `/api/state` | `app/api/state/route.ts` | `migrate-all-domains`, prefs |
| PUT | `/api/state` | same | Prefs only after migration |
| GET | `/api/summary` | `app/api/summary/route.ts` | Profile, cards, holdings, savings totals |
| GET | `/api/profile` | `app/api/profile/route.ts` | `lib/profile/load` |
| PATCH | `/api/profile` | same | Profile + insurance + ILP policies |

### Household & partner

| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/household` | `app/api/household/route.ts` |
| POST | `/api/partner/invites` | `app/api/partner/invites/route.ts` |
| POST | `/api/partner/invites/[id]` | `app/api/partner/invites/[id]/route.ts` |
| POST | `/api/partner/unlink` | `app/api/partner/unlink/route.ts` (admin client) |

### Budget, loans, income

| Method | Path | Handler | Primary lib |
|--------|------|---------|-------------|
| GET, PUT | `/api/budget-lines` | `app/api/budget-lines/route.ts` | `lib/budget/load` |
| GET, PUT | `/api/loans` | `app/api/loans/route.ts` | `lib/loans/load` |
| GET, PUT | `/api/other-loans` | `app/api/other-loans/route.ts` | `lib/other-loans/load` |
| POST | `/api/other-loans/[id]/pay` | `app/api/other-loans/[id]/pay/route.ts` | `lib/other-loans/pay` |
| GET, PUT | `/api/income-categories` | `app/api/income-categories/route.ts` | `lib/income/*` |
| GET | `/api/cashflow/additive-income` | `app/api/cashflow/additive-income/route.ts` | `startYm`, `count` query params |

### Savings & cash accounts

| Method | Path | Handler | Primary lib |
|--------|------|---------|-------------|
| GET, PUT | `/api/savings` | `app/api/savings/route.ts` | `lib/savings/*` |
| GET, PUT | `/api/accounts` | `app/api/accounts/route.ts` | `lib/savings/ledger` |
| GET, POST | `/api/accounts/[id]/transactions` | `app/api/accounts/[id]/transactions/route.ts` | `applyTransaction` |
| GET, POST | `/api/savings/pools/[id]/transactions` | `app/api/savings/pools/[id]/transactions/route.ts` | Pool ledger |
| GET | `/api/savings/goals/[id]/transactions` | `app/api/savings/goals/[id]/transactions/route.ts` | Goal history |
| POST | `/api/savings/goals/[id]/deposits` | `app/api/savings/goals/[id]/deposits/route.ts` | Goal deposit/withdraw |
| GET | `/api/financial-accounts` | `app/api/financial-accounts/route.ts` | `lib/financial-accounts/sync` |

### Credit cards

| Method | Path | Handler | Primary lib |
|--------|------|---------|-------------|
| GET, PUT | `/api/credit-cards` | `app/api/credit-cards/route.ts` | `lib/credit-cards/load` |
| GET | `/api/credit-cards/statements` | `app/api/credit-cards/statements/route.ts` | `lib/credit-cards/card-statements/load` |
| PATCH | `/api/credit-cards/statements/[id]` | `app/api/credit-cards/statements/[id]/route.ts` | `updateStatementFields` |
| POST | `/api/credit-cards/statements/[id]/pay` | `app/api/credit-cards/statements/[id]/pay/route.ts` | `recordCardStatementPayment` |
| DELETE | `/api/credit-cards/statements/[id]/pay` | same | `undoCardStatementPayment` |
| GET | `/api/credit-cards/calendar` | `app/api/credit-cards/calendar/route.ts` | Calendar amounts for This Month |

### Investments

| Method | Path | Handler |
|--------|------|---------|
| GET, PUT | `/api/holdings` | `app/api/holdings/route.ts` |
| GET, POST | `/api/portfolio/snapshots` | `app/api/portfolio/snapshots/route.ts` |
| POST | `/api/quotes` | `app/api/quotes/route.ts` — **no auth**; Yahoo Finance batch |

### Expenses & recurring

| Method | Path | Handler | Primary lib |
|--------|------|---------|-------------|
| GET | `/api/expenses` | `app/api/expenses/route.ts` | Paginated list; `from`, `to`, `offset`, `limit` |
| POST | `/api/expenses` | same | Budget expense or `autoCategory` payment + ledger sync |
| PATCH | `/api/expenses/[id]` | `app/api/expenses/[id]/route.ts` | Partial update |
| DELETE | `/api/expenses/[id]` | same | Ledger reverse + delete |
| GET | `/api/expenses/summary` | `app/api/expenses/summary/route.ts` | `ym` query; `buildBudgetExpenseSummary` |
| GET | `/api/recurring` | `app/api/recurring/route.ts` | Month view `ym`; built rows + paid status |
| GET, PUT | `/api/recurring-subscriptions` | `app/api/recurring-subscriptions/route.ts` | Subscription definitions |
| PATCH | `/api/recurring/deduction-day` | `app/api/recurring/deduction-day/route.ts` | `kind`, `sourceId`, `deductionDay` |

**POST /api/expenses** body (high level):

- Budget line expense: `budgetLineId` or category, `amount`, `spentAt`, optional `spentTime`, `note`, `financialAccountId`
- Auto payment: `autoCategory` (`debt` \| `insurance` \| `ilp` \| `subscription`), source id, `amount`, `spentAt`, optional `financialAccountId`

### Unified transactions

| Method | Path | Handler | Primary lib |
|--------|------|---------|-------------|
| GET | `/api/transactions` | `app/api/transactions/route.ts` | `lib/transactions/unified` |
| POST | `/api/transactions` | same | **410** — CSV import disabled |
| PATCH | `/api/transactions/[recordType]/[id]` | `app/api/transactions/[recordType]/[id]/route.ts` | `recordType`: `expense` \| `savings` \| `budget` |
| DELETE | `/api/transactions/[recordType]/[id]` | same | `lib/transactions/actions` |
| POST | `/api/transactions/[recordType]/[id]/reimburse` | `.../reimburse/route.ts` | Reimbursement ledger |

**GET /api/transactions** query params (common): `source` (`all` \| `savings` \| `budget` \| `expense`), `limit`, `offset`, `dateFrom`, `dateTo`, `accountId`, `poolId`, `financialAccountId`, `kind`, `transactionType`.

### Travel

| Method | Path | Handler |
|--------|------|---------|
| GET, POST | `/api/travel/trips` | `app/api/travel/trips/route.ts` |
| GET, PUT, DELETE | `/api/travel/trips/[id]` | `app/api/travel/trips/[id]/route.ts` |
| GET, PUT | `/api/travel/trips/[id]/budgets` | `app/api/travel/trips/[id]/budgets/route.ts` |
| GET, POST | `/api/travel/trips/[id]/expenses` | `app/api/travel/trips/[id]/expenses/route.ts` |

### Poker

| Method | Path | Handler |
|--------|------|---------|
| GET, POST | `/api/poker` | `app/api/poker/route.ts` |
| PATCH, DELETE | `/api/poker/[id]` | `app/api/poker/[id]/route.ts` |
| GET | `/api/poker/stats` | `app/api/poker/stats/route.ts` |
| GET, POST | `/api/poker/games` | `app/api/poker/games/route.ts` |
| GET, POST | `/api/poker/locations` | `app/api/poker/locations/route.ts` |

---

## Client fetch helper

[webapp/lib/fetch-json.ts](../webapp/lib/fetch-json.ts) — wraps `fetch`, parses JSON, used across hooks and forms.

## Related

- [04-features.md](./04-features.md) — Which UI uses which APIs
- [08-authentication-and-security.md](./08-authentication-and-security.md) — Session requirements
