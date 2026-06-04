# Pages guide

What each page is for, in sidebar order. Page names match the sidebar labels.

---

## Overview

### This Month

**Purpose:** A calendar view of the current month with money-related dates.

**You’ll see:**

- Credit card **statement** and **payment due** dates
- Recurring items (loans, insurance, subscriptions) on their deduction days
- Amounts tied to statements where you’ve entered them

**Typical use:** Glance at what’s due soon; jump to **Credit Cards** or **Recurring** to act.

---

### This Month Cashflow

**Purpose:** A simple **money in vs money out** picture for the current month.

**You’ll see:**

- Income (from salary settings on **ME**)
- Outflows: fixed budget items, subscriptions, insurance, card bills due, etc.

**Typical use:** Answer “roughly how much is left this month?” after planned bills.

---

## Planning

### Budget

**Purpose:** Your **monthly spending plan** — how much you intend to spend or save in each category.

**You’ll see:**

- Take-home pay vs total budget
- Lines grouped as fixed spend, variable spend, savings, invest
- Amounts that may be **linked** from loans, insurance, or ILP you configured elsewhere

**Typical use:** Set or adjust category limits at the start of the month; compare later to **Expenses**.

---

### Savings & Goals

**Purpose:** **Savings jars**, **shared pools** (with a partner), and **goals** with targets and progress.

**You’ll see:**

- Personal savings accounts and balances
- Optional household pools after partner linking
- Goals (target amount, saved so far, monthly contribution)

**Typical use:** Record deposits/withdrawals to pools; track progress toward a trip, emergency fund, etc.

**Note:** This is separate from everyday **Expenses** — it’s for savings you set aside, not daily groceries.

---

### 5-Month Cashflow

**Purpose:** A **forward-looking** view of the next five months.

**You’ll see:**

- Expected income and recurring outflows
- How surplus might flow to savings or other uses (based on your budget and settings)

**Typical use:** Medium-term planning — job change, big purchases, paying down debt.

---

### 5-Year Projection

**Purpose:** Long-term **wealth growth** scenarios.

**You’ll see:**

- Charts projecting net worth using budget, CPF, and investment assumptions from your profile

**Typical use:** “Where might I be in five years?” — exploratory, not a bank forecast.

---

### BTO Planner

**Purpose:** Plan a **BTO flat purchase** in Singapore.

**You’ll see:**

- Purchase price, grants, loan, downpayment, cash needed
- How it interacts with CPF (from **CPF Outlook**)

**Typical use:** Before applying for a flat; adjust numbers as you get firmer quotes.

---

## Tracking

### Expenses

**Purpose:** Log **actual spending** against your budget categories for a chosen month.

**You’ll see:**

- One card per budget category with allocated / used / remaining
- A form to add: date & time, amount, note, **pay from** account
- A list of entries for that category (manual rows; duplicates from old imports are avoided)

**Typical use:** After buying something, add it here with the right category and pay-from (especially if you used a credit card).

---

### Recurring

**Purpose:** Track **monthly obligations** and mark them **paid**.

**You’ll see:**

- Rows for **debt** (instalment loans), **insurance**, **ILP**, and **subscriptions**
- Per month: paid or not, with option to record payment (amount, date, pay from)
- A section to **edit subscription** list (Netflix, gym, etc.)

**Typical use:** At month-end, go through the list and record what you paid; undo if you recorded by mistake.

---

### Transaction history

**Purpose:** One **searchable timeline** of financial activity.

**You’ll see:**

- Deposits and withdrawals on cash accounts
- Expenses you logged
- Card/budget ledger rows (e.g. legacy imports)
- Filters: account, type, date range

**Typical use:** Find a specific transaction; delete or edit; understand cash balance changes.

---

### Travel

**Purpose:** Plan **trips** with per-category budgets and spending.

**You’ll see:**

- List of trips (planned / ongoing / completed)
- Per trip: budget lines (flights, hotel, food…) and expenses logged against them

**Typical use:** Open a trip → add expenses during the trip → compare spent vs budget.

**Sub-page:** Click a trip for detail (`/travel/[id]`).

---

### Poker tracker

**Purpose:** Log **poker sessions** for your own records.

**You’ll see:**

- Sessions: date, buy-in, cash-out, venue, game type
- Optional link to a cash account when money actually moved

**Sub-page:** **Poker statistics** (`/poker/stats`) — charts and summaries over time.

---

## Accounts

### Cash Accounts

**Purpose:** Your **liquid money** — bank accounts, e-wallets, cash jars.

**You’ll see:**

- Account names and balances
- Transfers between accounts
- Deposits and withdrawals
- Contribution to **net worth** (personal cash only; not partner pools)

**Typical use:** Update balances; record salary in; pay someone from an account.

---

### Credit Cards

**Purpose:** Manage **credit cards**, **billing cycles**, and **statement payments**.

**You’ll see:**

- **Open cycle** — spending in the current period (from expenses paid with that card)
- **Statements** — last closed cycle: statement amount you enter from the bank, **tracked** vs **untracked** spend, minimum due, pay / undo pay
- **Card list** — rewards info and Singapore catalog advisor (“which card for this purchase?”)

**Typical use:**

1. Add cards with correct **statement day** (e.g. 21 → cycle runs 22nd through 21st).
2. Log expenses with pay-from = that card.
3. When the bank statement arrives, enter the amount and record payment from cash.

---

### Investment

**Purpose:** **Stocks/ETFs** and **ILP** (investment-linked policies).

**You’ll see:**

- Holdings with quantity, cost, live price (when available), profit/loss
- Portfolio value over time (snapshots)
- ILP policies from profile (premiums, allocation)

**Typical use:** Update holdings; refresh prices; review allocation vs cashflow.

---

### CPF Outlook

**Purpose:** Enter **CPF balances** (OA, SA, MediSave, etc.) for planning views.

**You’ll see:**

- Fields for CPF accounts used in BTO and long-term projections

**Typical use:** Update after CPF statements; feeds **BTO Planner** and **5-Year Projection**.

---

### Debts & Loans

**Purpose:** **Instalment loans** (often tied to a card) and **other loans** (personal, balance transfer).

**You’ll see:**

- Monthly payment, outstanding balance, end date
- **Other loans** — tenure, APR, due dates, payments, balance transfer links to cards

**Typical use:** Keep outstanding amounts current; link card-related plans so **Recurring** and cashflow stay accurate.

---

## Configuration

### ME

**Purpose:** **Your profile** and app settings.

**You’ll see:**

- Salary, commission, salary credit day
- Insurance policies (non-ILP) and premiums
- **Partner** — invite by email to share household savings
- **Import / export** — backup or restore dashboard JSON
- Optional **dummy data** for trying the app
- Sign out

**Typical use:** Set up once; revisit when salary or insurance changes; invite partner; export backup before big changes.

---

## Pages not in the sidebar

| Page | How to reach |
|------|----------------|
| Login | `/login` when signed out |
| Poker statistics | From poker area or `/poker/stats` |
| Trip detail | Click a trip on **Travel** |

---

## Related

- [Workflows](./workflows.md) — Step-by-step tasks  
- [Getting started](./getting-started.md) — First-time setup
